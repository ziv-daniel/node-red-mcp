/**
 * OAuth 2.0 Authorization Server
 * Implements RFC 6749 (Authorization Code flow) + RFC 7636 (PKCE)
 * Required for Claude.ai web connector integration
 */

import { createHash, randomBytes } from 'crypto';

import axios from 'axios';
import type { Request, Response, Router } from 'express';
import { Router as createRouter } from 'express';

import type {
  OAuthClient,
  AuthorizationCode,
  AccessToken,
  NodeRedCredentials,
  OAuthAuthorizationServerMetadata,
} from '../types/oauth.js';

const TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour
const CODE_TTL_MS = 5 * 60 * 1000; // 5 minutes

// Allowed redirect URI prefixes for dynamically registered clients
const ALLOWED_REDIRECT_ORIGINS = [
  'https://claude.ai',
  'https://app.claude.ai',
  'https://www.claude.ai',
];

function isAllowedRedirectUri(uri: string): boolean {
  try {
    const parsed = new URL(uri);
    // Allow localhost for development/testing only
    if (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1') {
      return true;
    }
    return ALLOWED_REDIRECT_ORIGINS.some(origin => uri.startsWith(origin));
  } catch {
    return false;
  }
}

export class OAuthServer {
  private clients = new Map<string, OAuthClient>();
  private codes = new Map<string, AuthorizationCode>();
  private tokens = new Map<string, AccessToken>();
  private cleanupInterval: NodeJS.Timeout;

  constructor() {
    this.registerDefaultClients();
    // Purge expired tokens and codes every 10 minutes
    this.cleanupInterval = setInterval(() => this.cleanup(), 10 * 60 * 1000);
    this.cleanupInterval.unref();
  }

  private cleanup(): void {
    const now = Date.now();
    for (const [k, v] of this.tokens) {
      if (now > v.expiresAt) this.tokens.delete(k);
    }
    for (const [k, v] of this.codes) {
      if (now > v.expiresAt) this.codes.delete(k);
    }
  }

  destroy(): void {
    clearInterval(this.cleanupInterval);
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
        // Claude.ai actual callback URIs (RFC-compliant paths)
        'https://claude.ai/api/mcp/auth_callback',
        'https://claude.com/api/mcp/auth_callback',
        // Legacy / fallback paths
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

  createAuthorizationCode(
    params: Omit<AuthorizationCode, 'code' | 'expiresAt'>
  ): AuthorizationCode {
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

  revokeToken(token: string): void {
    this.tokens.delete(token);
  }

  // ── PKCE ─────────────────────────────────────────────────────────────────

  verifyCodeChallenge(verifier: string, challenge: string, method: 'S256'): boolean {
    const computed = createHash('sha256').update(verifier).digest('base64url');
    return computed === challenge;
  }

  // ── Express Router ────────────────────────────────────────────────────────

  createRouter(baseUrl: string): Router {
    const router = createRouter();

    // ── Discovery ────────────────────────────────────────────────────────
    router.get('/.well-known/oauth-authorization-server', (_req: Request, res: Response) => {
      const meta: OAuthAuthorizationServerMetadata = {
        issuer: baseUrl,
        // Advertise root paths — Claude.ai web ignores these and hardcodes /authorize /token /register,
        // but Claude Code and compliant clients will use these correctly.
        authorization_endpoint: `${baseUrl}/authorize`,
        token_endpoint: `${baseUrl}/token`,
        registration_endpoint: `${baseUrl}/register`,
        revocation_endpoint: `${baseUrl}/oauth/revoke`,
        scopes_supported: ['mcp:read', 'mcp:write', 'mcp:admin'],
        response_types_supported: ['code'],
        grant_types_supported: ['authorization_code'],
        token_endpoint_auth_methods_supported: ['none', 'client_secret_post'],
        code_challenge_methods_supported: ['S256'],
      };
      res.json(meta);
    });

    // ── Dynamic Client Registration (RFC 7591) ────────────────────────────
    // Claude.ai web hardcodes /register at root, so we expose it there.
    // Keep /oauth/register as well for compliant clients that read the metadata.
    const handleRegister = (req: Request, res: Response): void => {
      const { client_name, redirect_uris, scope } = req.body as {
        client_name?: string;
        redirect_uris?: string[];
        scope?: string;
      };

      if (!redirect_uris?.length) {
        res
          .status(400)
          .json({ error: 'invalid_client_metadata', error_description: 'redirect_uris required' });
        return;
      }

      // Validate all redirect URIs against allowlist
      const invalidUris = redirect_uris.filter(uri => !isAllowedRedirectUri(uri));
      if (invalidUris.length > 0) {
        res.status(400).json({
          error: 'invalid_client_metadata',
          error_description: 'One or more redirect_uris are not allowed',
        });
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
    };

    router.post('/register', handleRegister);
    router.post('/oauth/register', handleRegister);

    // ── Authorization Endpoint ────────────────────────────────────────────
    // GET /authorize — show login form for the user to enter Node-RED credentials
    const handleAuthorizeGet = (req: Request, res: Response): void => {
      const {
        client_id,
        redirect_uri,
        response_type,
        state,
        scope,
        code_challenge,
        code_challenge_method,
      } = req.query as Record<string, string | undefined>;

      if (!client_id || response_type !== 'code' || !code_challenge) {
        res.status(400).json({ error: 'invalid_request' });
        return;
      }

      // Only accept pre-registered clients — no auto-registration
      const client = this.clients.get(client_id);
      if (!client) {
        res.status(400).json({ error: 'invalid_client', error_description: 'Unknown client_id' });
        return;
      }

      // Validate redirect_uri against the client's registered URIs
      if (!redirect_uri) {
        res
          .status(400)
          .json({ error: 'invalid_request', error_description: 'redirect_uri required' });
        return;
      }
      if (!client.redirectUris.includes(redirect_uri)) {
        res.status(400).json({
          error: 'invalid_request',
          error_description: 'redirect_uri does not match registered URIs',
        });
        return;
      }

      if (!code_challenge) {
        res.status(400).json({
          error: 'invalid_request',
          error_description: 'code_challenge required (PKCE S256)',
        });
        return;
      }

      // Only S256 PKCE is supported
      if (code_challenge_method && code_challenge_method !== 'S256') {
        res.status(400).json({
          error: 'invalid_request',
          error_description: 'Only S256 code_challenge_method is supported',
        });
        return;
      }

      const authCode = this.createAuthorizationCode({
        clientId: client_id,
        redirectUri: redirect_uri,
        userId: 'mcp-user',
        scopes: scope ? scope.split(' ') : ['mcp:read', 'mcp:write'],
        codeChallenge: code_challenge,
        codeChallengeMethod: 'S256',
      });

      const params = new URLSearchParams({ code: authCode.code });
      if (state) params.set('state', state);
      res.redirect(302, `${redirect_uri}?${params.toString()}`);
    };

    // POST /authorize mirrors GET — some clients POST the authorization request
    const handleAuthorizePost = handleAuthorizeGet;

    router.get('/authorize', handleAuthorizeGet);
    router.get('/oauth/authorize', handleAuthorizeGet);
    router.post('/authorize', handleAuthorizePost);
    router.post('/oauth/authorize', handleAuthorizePost);

    // ── Token Endpoint ────────────────────────────────────────────────────
    // Claude.ai web hardcodes /token, compliant clients use path from metadata.
    const handleToken = (req: Request, res: Response): void => {
      const { grant_type, code, redirect_uri, client_id, code_verifier } = req.body as Record<
        string,
        string
      >;

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
        res
          .status(400)
          .json({ error: 'invalid_grant', error_description: 'Code invalid or expired' });
        return;
      }

      if (authCode.clientId !== client_id) {
        res.status(400).json({ error: 'invalid_grant', error_description: 'client_id mismatch' });
        return;
      }

      // PKCE verification (required)
      if (!code_verifier) {
        res
          .status(400)
          .json({ error: 'invalid_grant', error_description: 'code_verifier required' });
        return;
      }

      const valid = this.verifyCodeChallenge(code_verifier, authCode.codeChallenge, 'S256');
      if (!valid) {
        res
          .status(400)
          .json({ error: 'invalid_grant', error_description: 'PKCE verification failed' });
        return;
      }

      if (redirect_uri && authCode.redirectUri && authCode.redirectUri !== redirect_uri) {
        res
          .status(400)
          .json({ error: 'invalid_grant', error_description: 'redirect_uri mismatch' });
        return;
      }

      const accessToken = this.createAccessToken({
        clientId: authCode.clientId,
        userId: authCode.userId,
        scopes: authCode.scopes,
        ...(authCode.nodeRedCredentials && { nodeRedCredentials: authCode.nodeRedCredentials }),
      });

      res.json({
        access_token: accessToken.token,
        token_type: 'Bearer',
        expires_in: Math.floor(TOKEN_TTL_MS / 1000),
        scope: accessToken.scopes.join(' '),
      });
    };

    router.post('/token', handleToken);
    router.post('/oauth/token', handleToken);

    // ── Token Revocation (RFC 7009) ───────────────────────────────────────
    router.post('/oauth/revoke', (req: Request, res: Response) => {
      const { token } = req.body as { token?: string };
      if (token) {
        this.revokeToken(token);
      }
      // RFC 7009: always respond 200 regardless of whether token existed
      res.status(200).end();
    });

    return router;
  }
}
