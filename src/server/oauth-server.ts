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

  // ── PKCE ─────────────────────────────────────────────────────────────────

  verifyCodeChallenge(verifier: string, challenge: string, method: 'S256' | 'plain'): boolean {
    if (method === 'S256') {
      const computed = createHash('sha256').update(verifier).digest('base64url');
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
        // Advertise root paths — Claude.ai web ignores these and hardcodes /authorize /token /register,
        // but Claude Code and compliant clients will use these correctly.
        authorization_endpoint: `${baseUrl}/authorize`,
        token_endpoint: `${baseUrl}/token`,
        registration_endpoint: `${baseUrl}/register`,
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

      // Auto-register unknown clients
      if (!this.clients.get(client_id)) {
        const newClient = this.registerClient({
          name: 'Claude',
          redirectUris: redirect_uri ? [redirect_uri] : [],
          scopes: scope ? scope.split(' ') : ['mcp:read', 'mcp:write'],
        });
        this.clients.delete(newClient.clientId);
        this.clients.set(client_id, { ...newClient, clientId: client_id });
      }

      const defaultUrl = process.env.NODERED_URL || 'https://nodered.danielshaprvt.work';
      const q = new URLSearchParams({
        client_id,
        redirect_uri: redirect_uri ?? '',
        response_type,
        state: state ?? '',
        scope: scope ?? '',
        code_challenge,
        code_challenge_method: code_challenge_method ?? 'S256',
      }).toString();

      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.send(`<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>התחבר ל-Node-RED</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
         background: #f0f2f5; display: flex; align-items: center; justify-content: center;
         min-height: 100vh; padding: 20px; }
  .card { background: #fff; border-radius: 12px; box-shadow: 0 4px 24px rgba(0,0,0,.12);
          padding: 36px; width: 100%; max-width: 420px; }
  .logo { text-align: center; margin-bottom: 24px; font-size: 32px; }
  h1 { text-align: center; font-size: 20px; color: #1a1a1a; margin-bottom: 6px; }
  .subtitle { text-align: center; color: #666; font-size: 14px; margin-bottom: 28px; }
  label { display: block; font-size: 14px; font-weight: 500; color: #333; margin-bottom: 6px; }
  input[type=text], input[type=password], input[type=url] {
    width: 100%; padding: 10px 14px; border: 1px solid #d1d5db; border-radius: 8px;
    font-size: 15px; outline: none; transition: border-color .2s; }
  input:focus { border-color: #6366f1; box-shadow: 0 0 0 3px rgba(99,102,241,.1); }
  .field { margin-bottom: 18px; }
  .auth-tabs { display: flex; gap: 8px; margin-bottom: 18px; }
  .tab { flex: 1; padding: 8px; border: 1px solid #d1d5db; border-radius: 8px; background: #f9fafb;
         cursor: pointer; text-align: center; font-size: 13px; color: #555; transition: all .15s; }
  .tab.active { background: #6366f1; color: #fff; border-color: #6366f1; }
  .section { display: none; }
  .section.visible { display: block; }
  button[type=submit] { width: 100%; padding: 12px; background: #6366f1; color: #fff;
    border: none; border-radius: 8px; font-size: 16px; font-weight: 600; cursor: pointer;
    margin-top: 8px; transition: background .2s; }
  button[type=submit]:hover { background: #4f46e5; }
  .error { background: #fef2f2; border: 1px solid #fecaca; color: #dc2626;
           padding: 10px 14px; border-radius: 8px; font-size: 14px; margin-bottom: 16px; display: none; }
  .error.show { display: block; }
  .spinner { display: none; }
  button.loading .spinner { display: inline; }
  button.loading .btn-text { display: none; }
</style>
</head>
<body>
<div class="card">
  <div class="logo">🔴</div>
  <h1>התחבר ל-Node-RED</h1>
  <p class="subtitle">הזן את פרטי הגישה ל-Node-RED שלך</p>

  <div id="errMsg" class="error"></div>

  <form id="loginForm" method="POST" action="/authorize?${q}">
    <div class="field">
      <label for="nr_url">כתובת Node-RED</label>
      <input type="url" id="nr_url" name="nr_url" value="${defaultUrl}"
             placeholder="https://nodered.example.com" required>
    </div>

    <div class="auth-tabs">
      <div class="tab active" onclick="setTab('bearer')">API Token</div>
      <div class="tab" onclick="setTab('basic')">שם משתמש + סיסמה</div>
    </div>
    <input type="hidden" name="auth_type" id="auth_type" value="bearer">

    <div id="sec-bearer" class="section visible">
      <div class="field">
        <label for="nr_token">Token (Bearer)</label>
        <input type="password" id="nr_token" name="nr_token"
               placeholder="HA Long-Lived Access Token">
      </div>
    </div>

    <div id="sec-basic" class="section">
      <div class="field">
        <label for="nr_user">שם משתמש</label>
        <input type="text" id="nr_user" name="nr_user" placeholder="admin">
      </div>
      <div class="field">
        <label for="nr_pass">סיסמה</label>
        <input type="password" id="nr_pass" name="nr_pass" placeholder="">
      </div>
    </div>

    <button type="submit" id="submitBtn">
      <span class="btn-text">התחבר</span>
      <span class="spinner">⏳ מתחבר...</span>
    </button>
  </form>
</div>
<script>
function setTab(t) {
  document.querySelectorAll('.tab').forEach((el,i) =>
    el.classList.toggle('active', (i===0&&t==='bearer')||(i===1&&t==='basic')));
  document.getElementById('sec-bearer').classList.toggle('visible', t==='bearer');
  document.getElementById('sec-basic').classList.toggle('visible', t==='basic');
  document.getElementById('auth_type').value = t;
}
document.getElementById('loginForm').addEventListener('submit', function() {
  document.getElementById('submitBtn').classList.add('loading');
});
</script>
</body>
</html>`);
    };

    // POST /authorize — validate credentials and issue auth code
    const handleAuthorizePost = async (req: Request, res: Response): Promise<void> => {
      const { client_id, redirect_uri, state, scope, code_challenge, code_challenge_method } =
        req.query as Record<string, string | undefined>;

      const { nr_url, auth_type, nr_token, nr_user, nr_pass } = req.body as Record<string, string>;

      // Validate Node-RED credentials by calling /settings
      const creds: NodeRedCredentials =
        auth_type === 'basic'
          ? {
              url: (nr_url || '').replace(/\/$/, ''),
              authType: 'basic',
              username: nr_user || '',
              password: nr_pass || '',
            }
          : {
              url: (nr_url || '').replace(/\/$/, ''),
              authType: 'bearer',
              token: nr_token || '',
            };

      const authHeader =
        creds.authType === 'basic'
          ? `Basic ${Buffer.from(`${creds.username}:${creds.password}`).toString('base64')}`
          : creds.token
            ? `Bearer ${creds.token}`
            : undefined;

      const skipValidation = process.env.NODERED_SKIP_CREDENTIAL_VALIDATION === 'true';
      if (!skipValidation) {
        try {
          await axios.get(`${creds.url}/settings`, {
            timeout: 8000,
            headers: { ...(authHeader ? { Authorization: authHeader } : {}) },
            httpsAgent: new (await import('https')).Agent({ rejectUnauthorized: false }),
          });
        } catch (err: unknown) {
          const status = axios.isAxiosError(err) ? err.response?.status : undefined;
          // 401/403 → wrong credentials; connection errors → wrong URL
          const msg =
            status === 401 || status === 403
              ? 'שם משתמש / סיסמה / token שגויים'
              : `לא ניתן להתחבר ל-Node-RED: ${creds.url}`;

        const q = new URLSearchParams({
          client_id: client_id ?? '',
          redirect_uri: redirect_uri ?? '',
          response_type: 'code',
          state: state ?? '',
          scope: scope ?? '',
          code_challenge: code_challenge ?? '',
          code_challenge_method: code_challenge_method ?? 'S256',
        }).toString();

          res.setHeader('Content-Type', 'text/html; charset=utf-8');
          res.status(400).send(`<!DOCTYPE html>
<html lang="he" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>שגיאה</title>
<style>body{font-family:sans-serif;background:#f0f2f5;display:flex;align-items:center;justify-content:center;min-height:100vh}
.card{background:#fff;border-radius:12px;padding:32px;max-width:420px;width:100%;text-align:center}
.err{background:#fef2f2;border:1px solid #fecaca;color:#dc2626;padding:12px;border-radius:8px;margin:16px 0}
a{color:#6366f1;text-decoration:none;font-weight:600}</style></head>
<body><div class="card"><div style="font-size:32px">❌</div>
<h2 style="margin:12px 0">שגיאת חיבור</h2>
<div class="err">${msg}</div>
<a href="/authorize?${q}">← נסה שוב</a></div></body></html>`);
          return;
        }
      }

      const authCode = this.createAuthorizationCode({
        clientId: client_id ?? '',
        redirectUri: redirect_uri ?? '',
        userId: 'mcp-user',
        scopes: scope ? scope.split(' ') : ['mcp:read', 'mcp:write'],
        codeChallenge: code_challenge ?? '',
        codeChallengeMethod: (code_challenge_method as 'S256' | 'plain') || 'S256',
        nodeRedCredentials: creds,
      });

      const params = new URLSearchParams({ code: authCode.code });
      if (state) params.set('state', state);
      res.redirect(302, `${redirect_uri}?${params.toString()}`);
    };

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

      if (authCode.codeChallenge && !code_verifier) {
        res
          .status(400)
          .json({ error: 'invalid_grant', error_description: 'code_verifier required' });
        return;
      }

      if (code_verifier) {
        const valid = this.verifyCodeChallenge(
          code_verifier,
          authCode.codeChallenge,
          authCode.codeChallengeMethod
        );
        if (!valid) {
          res
            .status(400)
            .json({ error: 'invalid_grant', error_description: 'PKCE verification failed' });
          return;
        }
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

    return router;
  }
}
