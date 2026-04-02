/**
 * OAuth 2.0 Authorization Server
 * Implements RFC 6749 (Authorization Code flow) + RFC 7636 (PKCE)
 * Required for Claude.ai web connector integration
 */

import { createHash, randomBytes } from 'crypto';

import type { Request, Response, Router } from 'express';
import { Router as createRouter } from 'express';

import type {
  OAuthClient,
  AuthorizationCode,
  AccessToken,
  OAuthAuthorizationServerMetadata,
} from '../types/oauth.js';

const TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour
const CODE_TTL_MS = 5 * 60 * 1000; // 5 minutes

export class OAuthServer {
  private clients = new Map<string, OAuthClient>();
  private codes = new Map<string, AuthorizationCode>();
  private tokens = new Map<string, AccessToken>();

  constructor() {
    this.registerDefaultClients();
  }

  /**
   * Pre-register Claude.ai as a known client.
   * Claude uses dynamic registration, but having a fallback client avoids
   * requiring it.
   */
  private registerDefaultClients(): void {
    const claudeClientId = process.env.OAUTH_CLAUDE_CLIENT_ID || 'claude-ai-client';

    this.clients.set(claudeClientId, {
      clientId: claudeClientId,
      redirectUris: [
        'https://claude.ai/oauth/callback',
        'https://app.claude.ai/oauth/callback',
        // Allow localhost redirect for testing
        'http://localhost:3000/oauth/callback',
        'http://localhost:8080/oauth/callback',
      ],
      name: 'Claude.ai',
      scopes: ['mcp:read', 'mcp:write', 'mcp:admin'],
    });
  }

  /**
   * Register a new client (Dynamic Client Registration — RFC 7591)
   */
  registerClient(client: Omit<OAuthClient, 'clientId'>): OAuthClient {
    const clientId = randomBytes(16).toString('hex');
    const full: OAuthClient = { ...client, clientId };
    this.clients.set(clientId, full);
    return full;
  }

  getClient(clientId: string): OAuthClient | undefined {
    return this.clients.get(clientId);
  }

  // ── Authorization Code ────────────────────────────────────────────────────

  createAuthorizationCode(params: Omit<AuthorizationCode, 'code' | 'expiresAt'>): AuthorizationCode {
    const code: AuthorizationCode = {
      ...params,
      code: randomBytes(32).toString('hex'),
      expiresAt: Date.now() + CODE_TTL_MS,
    };
    this.codes.set(code.code, code);
    return code;
  }

  consumeAuthorizationCode(code: string): AuthorizationCode | null {
    const entry = this.codes.get(code);
    this.codes.delete(code); // single-use
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) return null;
    return entry;
  }

  // ── Access Token ─────────────────────────────────────────────────────────

  createAccessToken(params: Omit<AccessToken, 'token' | 'expiresAt'>): AccessToken {
    const token: AccessToken = {
      ...params,
      token: randomBytes(40).toString('hex'),
      expiresAt: Date.now() + TOKEN_TTL_MS,
    };
    this.tokens.set(token.token, token);
    return token;
  }

  validateToken(token: string): AccessToken | null {
    const entry = this.tokens.get(token);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.tokens.delete(token);
      return null;
    }
    return entry;
  }

  // ── PKCE ─────────────────────────────────────────────────────────────────

  verifyCodeChallenge(
    verifier: string,
    challenge: string,
    method: 'S256' | 'plain'
  ): boolean {
    if (method === 'S256') {
      const computed = createHash('sha256')
        .update(verifier)
        .digest('base64url');
      return computed === challenge;
    }
    // plain
    return verifier === challenge;
  }

  // ── Express Router ────────────────────────────────────────────────────────

  createRouter(baseUrl: string): Router {
    const router = createRouter();

    // ── Discovery ────────────────────────────────────────────────────────
    router.get('/.well-known/oauth-authorization-server', (_req: Request, res: Response) => {
      const meta: OAuthAuthorizationServerMetadata = {
        issuer: baseUrl,
        authorization_endpoint: `${baseUrl}/oauth/authorize`,
        token_endpoint: `${baseUrl}/oauth/token`,
        registration_endpoint: `${baseUrl}/oauth/register`,
        scopes_supported: ['mcp:read', 'mcp:write', 'mcp:admin'],
        response_types_supported: ['code'],
        grant_types_supported: ['authorization_code'],
        token_endpoint_auth_methods_supported: ['none', 'client_secret_post'],
        code_challenge_methods_supported: ['S256', 'plain'],
      };
      res.json(meta);
    });

    // ── Dynamic Client Registration (RFC 7591) ────────────────────────────
    router.post('/oauth/register', (req: Request, res: Response) => {
      const { client_name, redirect_uris, scope } = req.body as {
        client_name?: string;
        redirect_uris?: string[];
        scope?: string;
      };

      if (!redirect_uris?.length) {
        res.status(400).json({ error: 'invalid_client_metadata', error_description: 'redirect_uris required' });
        return;
      }

      const client = this.registerClient({
        name: client_name || 'Unknown Client',
        redirectUris: redirect_uris,
        scopes: scope ? scope.split(' ') : ['mcp:read', 'mcp:write'],
      });

      res.status(201).json({
        client_id: client.clientId,
        client_name: client.name,
        redirect_uris: client.redirectUris,
        grant_types: ['authorization_code'],
        response_types: ['code'],
        token_endpoint_auth_method: 'none',
      });
    });

    // ── Authorization Endpoint ────────────────────────────────────────────
    router.get('/oauth/authorize', (req: Request, res: Response) => {
      const {
        client_id,
        redirect_uri,
        response_type,
        state,
        scope,
        code_challenge,
        code_challenge_method,
      } = req.query as Record<string, string | undefined>;

      // Validate required params
      if (!client_id) {
        res.status(400).json({ error: 'invalid_request', error_description: 'client_id required' });
        return;
      }
      if (response_type !== 'code') {
        res.status(400).json({ error: 'unsupported_response_type' });
        return;
      }

      const client = this.clients.get(client_id);
      if (!client) {
        // Auto-register unknown clients (permissive for Claude compatibility)
        const newClient = this.registerClient({
          name: 'Auto-registered Client',
          redirectUris: redirect_uri ? [redirect_uri] : [],
          scopes: scope ? scope.split(' ') : ['mcp:read', 'mcp:write'],
        });
        this.clients.delete(newClient.clientId);
        this.clients.set(client_id, { ...newClient, clientId: client_id });
      }

      if (!code_challenge) {
        res.status(400).json({
          error: 'invalid_request',
          error_description: 'code_challenge required (PKCE)',
        });
        return;
      }

      // For server-to-server / headless: auto-approve
      // In production this would show a consent screen
      const userId = 'mcp-user';
      const authCode = this.createAuthorizationCode({
        clientId: client_id, // narrowed to string above
        redirectUri: redirect_uri ?? '',
        userId,
        scopes: scope ? scope.split(' ') : ['mcp:read', 'mcp:write'],
        codeChallenge: code_challenge,
        codeChallengeMethod: (code_challenge_method as 'S256' | 'plain') || 'S256',
      });

      const params = new URLSearchParams({ code: authCode.code });
      if (state) params.set('state', state);

      const redirectTo = `${redirect_uri}?${params.toString()}`;
      res.redirect(302, redirectTo);
    });

    // ── Token Endpoint ────────────────────────────────────────────────────
    router.post('/oauth/token', (req: Request, res: Response) => {
      const {
        grant_type,
        code,
        redirect_uri,
        client_id,
        code_verifier,
      } = req.body as Record<string, string>;

      if (grant_type !== 'authorization_code') {
        res.status(400).json({ error: 'unsupported_grant_type' });
        return;
      }

      if (!code) {
        res.status(400).json({ error: 'invalid_request', error_description: 'code required' });
        return;
      }

      const authCode = this.consumeAuthorizationCode(code);
      if (!authCode) {
        res.status(400).json({ error: 'invalid_grant', error_description: 'Code invalid or expired' });
        return;
      }

      if (authCode.clientId !== client_id) {
        res.status(400).json({ error: 'invalid_grant', error_description: 'client_id mismatch' });
        return;
      }

      // PKCE verification
      if (authCode.codeChallenge && !code_verifier) {
        res.status(400).json({ error: 'invalid_grant', error_description: 'code_verifier required' });
        return;
      }

      if (code_verifier) {
        const valid = this.verifyCodeChallenge(
          code_verifier,
          authCode.codeChallenge,
          authCode.codeChallengeMethod
        );
        if (!valid) {
          res.status(400).json({ error: 'invalid_grant', error_description: 'PKCE verification failed' });
          return;
        }
      }

      if (redirect_uri && authCode.redirectUri && authCode.redirectUri !== redirect_uri) {
        res.status(400).json({ error: 'invalid_grant', error_description: 'redirect_uri mismatch' });
        return;
      }

      const accessToken = this.createAccessToken({
        clientId: authCode.clientId,
        userId: authCode.userId,
        scopes: authCode.scopes,
      });

      res.json({
        access_token: accessToken.token,
        token_type: 'Bearer',
        expires_in: Math.floor(TOKEN_TTL_MS / 1000),
        scope: accessToken.scopes.join(' '),
      });
    });

    return router;
  }
}
