/**
 * Contract tests — OAuth 2.0 Authorization Server
 * Validates RFC 6749 + PKCE (RFC 7636) + RFC 6749 §6 (refresh) + RFC 7009 (revocation)
 */

import { createHash, randomBytes } from 'crypto';

import express from 'express';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';

import { OAuthServer } from '../../src/server/oauth-server.js';

// ── PKCE helpers ──────────────────────────────────────────────────────────────

function makeCodeVerifier(): string {
  return randomBytes(32).toString('base64url');
}

function makeCodeChallenge(verifier: string): string {
  return createHash('sha256').update(verifier).digest('base64url');
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('OAuthServer', () => {
  let server: OAuthServer;

  beforeEach(() => {
    server = new OAuthServer();
  });

  // ── Discovery ─────────────────────────────────────────────────────────────

  describe('/.well-known/oauth-authorization-server (RFC 8414)', () => {
    it('metadata router is created without throwing', () => {
      expect(() => server.createRouter('https://example.com')).not.toThrow();
    });
  });

  // ── Dynamic Client Registration ───────────────────────────────────────────

  describe('Dynamic Client Registration (RFC 7591)', () => {
    it('registers a client and returns a clientId', () => {
      const client = server.registerClient({
        name: 'Test App',
        redirectUris: ['https://app.example.com/callback'],
        scopes: ['mcp:read'],
      });

      expect(client.clientId).toBeTruthy();
      expect(client.name).toBe('Test App');
      expect(client.redirectUris).toContain('https://app.example.com/callback');
    });

    it('each registration produces a unique clientId', () => {
      const a = server.registerClient({ name: 'A', redirectUris: ['https://a.com'], scopes: [] });
      const b = server.registerClient({ name: 'B', redirectUris: ['https://b.com'], scopes: [] });
      expect(a.clientId).not.toBe(b.clientId);
    });

    it('registered client is retrievable', () => {
      const client = server.registerClient({
        name: 'X',
        redirectUris: ['https://x.com'],
        scopes: [],
      });
      const found = server.getClient(client.clientId);
      expect(found?.name).toBe('X');
    });
  });

  // ── Authorization Code ────────────────────────────────────────────────────

  describe('Authorization Code', () => {
    it('creates a unique code each time', () => {
      const verifier = makeCodeVerifier();
      const challenge = makeCodeChallenge(verifier);

      const a = server.createAuthorizationCode({
        clientId: 'c1',
        redirectUri: 'https://cb.com',
        userId: 'u1',
        scopes: ['mcp:read'],
        codeChallenge: challenge,
        codeChallengeMethod: 'S256',
      });
      const b = server.createAuthorizationCode({
        clientId: 'c1',
        redirectUri: 'https://cb.com',
        userId: 'u1',
        scopes: ['mcp:read'],
        codeChallenge: challenge,
        codeChallengeMethod: 'S256',
      });

      expect(a.code).not.toBe(b.code);
    });

    it('code is single-use — consumed on first call', () => {
      const verifier = makeCodeVerifier();
      const challenge = makeCodeChallenge(verifier);
      const { code } = server.createAuthorizationCode({
        clientId: 'c1',
        redirectUri: 'https://cb.com',
        userId: 'u1',
        scopes: ['mcp:read'],
        codeChallenge: challenge,
        codeChallengeMethod: 'S256',
      });

      expect(server.consumeAuthorizationCode(code)).not.toBeNull();
      expect(server.consumeAuthorizationCode(code)).toBeNull(); // second use
    });

    it('returns null for unknown code', () => {
      expect(server.consumeAuthorizationCode('nonexistent')).toBeNull();
    });
  });

  // ── PKCE Verification ─────────────────────────────────────────────────────

  describe('PKCE (RFC 7636)', () => {
    it('S256: verifies correct verifier', () => {
      const verifier = makeCodeVerifier();
      const challenge = makeCodeChallenge(verifier);
      expect(server.verifyCodeChallenge(verifier, challenge, 'S256')).toBe(true);
    });

    it('S256: rejects wrong verifier', () => {
      const verifier = makeCodeVerifier();
      const challenge = makeCodeChallenge(verifier);
      const wrongVerifier = makeCodeVerifier();
      expect(server.verifyCodeChallenge(wrongVerifier, challenge, 'S256')).toBe(false);
    });

    // plain PKCE method is intentionally not supported (only S256 is allowed)
  });

  // ── Access Token ──────────────────────────────────────────────────────────

  describe('Access Token', () => {
    it('creates a valid token', () => {
      const token = server.createAccessToken({
        clientId: 'c1',
        userId: 'u1',
        scopes: ['mcp:read'],
      });
      expect(token.token).toBeTruthy();
      expect(token.expiresAt).toBeGreaterThan(Date.now());
    });

    it('validates a created token', () => {
      const { token } = server.createAccessToken({
        clientId: 'c1',
        userId: 'u1',
        scopes: ['mcp:read'],
      });
      const validated = server.validateToken(token);
      expect(validated?.userId).toBe('u1');
    });

    it('returns null for unknown token', () => {
      expect(server.validateToken('bad-token')).toBeNull();
    });

    it('each token is unique', () => {
      const a = server.createAccessToken({ clientId: 'c1', userId: 'u1', scopes: [] });
      const b = server.createAccessToken({ clientId: 'c1', userId: 'u1', scopes: [] });
      expect(a.token).not.toBe(b.token);
    });
  });

  // ── Token Revocation (RFC 7009) ───────────────────────────────────────────

  describe('Token Revocation (RFC 7009)', () => {
    it('revoked token is immediately invalid', () => {
      const { token } = server.createAccessToken({
        clientId: 'c1',
        userId: 'u1',
        scopes: ['mcp:read'],
      });

      expect(server.validateToken(token)).not.toBeNull();
      server.revokeToken(token);
      expect(server.validateToken(token)).toBeNull();
    });

    it('revoking unknown token does not throw', () => {
      expect(() => server.revokeToken('nonexistent-token')).not.toThrow();
    });

    it('revoking one token does not affect others', () => {
      const a = server.createAccessToken({ clientId: 'c1', userId: 'u1', scopes: [] });
      const b = server.createAccessToken({ clientId: 'c1', userId: 'u2', scopes: [] });

      server.revokeToken(a.token);

      expect(server.validateToken(a.token)).toBeNull();
      expect(server.validateToken(b.token)).not.toBeNull();
    });
  });

  // ── Refresh Token (RFC 6749 §6) ───────────────────────────────────────────

  describe('Refresh Token', () => {
    it('creates a unique token each time', () => {
      const a = server.createRefreshToken({ clientId: 'c1', userId: 'u1', scopes: ['mcp:read'] });
      const b = server.createRefreshToken({ clientId: 'c1', userId: 'u1', scopes: ['mcp:read'] });
      expect(a.token).not.toBe(b.token);
    });

    it('consumeRefreshToken is single-use', () => {
      const { token } = server.createRefreshToken({ clientId: 'c1', userId: 'u1', scopes: [] });
      expect(server.consumeRefreshToken(token)).not.toBeNull();
      expect(server.consumeRefreshToken(token)).toBeNull();
    });

    it('returns null for unknown token', () => {
      expect(server.consumeRefreshToken('nonexistent')).toBeNull();
    });

    it('revokeRefreshToken invalidates the token', () => {
      const { token } = server.createRefreshToken({ clientId: 'c1', userId: 'u1', scopes: [] });
      server.revokeRefreshToken(token);
      expect(server.consumeRefreshToken(token)).toBeNull();
    });

    it('revoking unknown refresh token does not throw', () => {
      expect(() => server.revokeRefreshToken('nonexistent')).not.toThrow();
    });
  });

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  describe('Lifecycle', () => {
    it('destroy() stops the cleanup interval without throwing', () => {
      const s = new OAuthServer();
      expect(() => s.destroy()).not.toThrow();
    });
  });

  // ── Token Endpoint — Refresh Grant (HTTP) ────────────────────────────────

  describe('Token endpoint — refresh_token grant', () => {
    let app: express.Express;

    beforeEach(() => {
      server = new OAuthServer();
      app = express();
      app.use(express.urlencoded({ extended: false }));
      app.use(express.json());
      app.use(server.createRouter('http://localhost'));
    });

    afterEach(() => {
      server.destroy();
    });

    it('issues new access + refresh tokens and invalidates old refresh token', async () => {
      const rt = server.createRefreshToken({ clientId: 'c1', userId: 'u1', scopes: ['mcp:read'] });

      const res = await request(app)
        .post('/token')
        .type('form')
        .send({ grant_type: 'refresh_token', refresh_token: rt.token, client_id: 'c1' });

      expect(res.status).toBe(200);
      expect(res.body.access_token).toBeTruthy();
      expect(res.body.refresh_token).toBeTruthy();
      expect(res.body.refresh_token).not.toBe(rt.token);
      expect(res.body.token_type).toBe('Bearer');
      expect(res.body.refresh_token_expires_in).toBeGreaterThan(0);

      // old refresh token must be consumed (rotation)
      expect(server.consumeRefreshToken(rt.token)).toBeNull();
    });

    it('returns invalid_grant for unknown refresh token', async () => {
      const res = await request(app)
        .post('/token')
        .type('form')
        .send({ grant_type: 'refresh_token', refresh_token: 'bad-token' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('invalid_grant');
    });

    it('returns invalid_request when refresh_token is missing', async () => {
      const res = await request(app)
        .post('/token')
        .type('form')
        .send({ grant_type: 'refresh_token' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('invalid_request');
    });

    it('returns invalid_grant on client_id mismatch', async () => {
      const rt = server.createRefreshToken({ clientId: 'c1', userId: 'u1', scopes: [] });

      const res = await request(app)
        .post('/token')
        .type('form')
        .send({ grant_type: 'refresh_token', refresh_token: rt.token, client_id: 'wrong-client' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('invalid_grant');
    });

    it('auth code grant response includes refresh_token', async () => {
      const verifier = randomBytes(32).toString('base64url');
      const challenge = createHash('sha256').update(verifier).digest('base64url');
      const { code } = server.createAuthorizationCode({
        clientId: 'c1',
        redirectUri: 'https://claude.ai/oauth/callback',
        userId: 'u1',
        scopes: ['mcp:read'],
        codeChallenge: challenge,
        codeChallengeMethod: 'S256',
      });

      const res = await request(app)
        .post('/token')
        .type('form')
        .send({
          grant_type: 'authorization_code',
          code,
          code_verifier: verifier,
          redirect_uri: 'https://claude.ai/oauth/callback',
          client_id: 'c1',
        });

      expect(res.status).toBe(200);
      expect(res.body.access_token).toBeTruthy();
      expect(res.body.refresh_token).toBeTruthy();
      expect(res.body.refresh_token_expires_in).toBeGreaterThan(0);
    });
  });

  // ── Token Revocation — token_type_hint (HTTP) ─────────────────────────────

  describe('Token revocation — token_type_hint routing', () => {
    let app: express.Express;

    beforeEach(() => {
      server = new OAuthServer();
      app = express();
      app.use(express.urlencoded({ extended: false }));
      app.use(express.json());
      app.use(server.createRouter('http://localhost'));
    });

    afterEach(() => {
      server.destroy();
    });

    it('hint=refresh_token revokes only the refresh token', async () => {
      const at = server.createAccessToken({ clientId: 'c1', userId: 'u1', scopes: [] });
      const rt = server.createRefreshToken({ clientId: 'c1', userId: 'u1', scopes: [] });

      await request(app)
        .post('/oauth/revoke')
        .type('form')
        .send({ token: rt.token, token_type_hint: 'refresh_token' });

      expect(server.validateToken(at.token)).not.toBeNull(); // access token untouched
      expect(server.consumeRefreshToken(rt.token)).toBeNull(); // refresh token gone
    });

    it('hint=access_token revokes only the access token', async () => {
      const at = server.createAccessToken({ clientId: 'c1', userId: 'u1', scopes: [] });
      const rt = server.createRefreshToken({ clientId: 'c1', userId: 'u1', scopes: [] });

      await request(app)
        .post('/oauth/revoke')
        .type('form')
        .send({ token: at.token, token_type_hint: 'access_token' });

      expect(server.validateToken(at.token)).toBeNull(); // access token gone
      expect(server.consumeRefreshToken(rt.token)).not.toBeNull(); // refresh token untouched
    });

    it('no hint tries both token stores', async () => {
      const at = server.createAccessToken({ clientId: 'c1', userId: 'u1', scopes: [] });

      const res = await request(app)
        .post('/oauth/revoke')
        .type('form')
        .send({ token: at.token });

      expect(res.status).toBe(200);
      expect(server.validateToken(at.token)).toBeNull();
    });

    it('always returns 200 even for unknown tokens', async () => {
      const res = await request(app)
        .post('/oauth/revoke')
        .type('form')
        .send({ token: 'nonexistent-token' });

      expect(res.status).toBe(200);
    });

    it('discovery metadata lists refresh_token grant type', async () => {
      const res = await request(app).get('/.well-known/oauth-authorization-server');
      expect(res.status).toBe(200);
      expect(res.body.grant_types_supported).toContain('refresh_token');
    });
  });

  // ── Full Authorization Code Flow ──────────────────────────────────────────

  describe('Full Authorization Code + PKCE flow', () => {
    it('complete flow produces a valid access token', () => {
      const clientId = 'claude-ai-client';
      const redirectUri = 'https://claude.ai/oauth/callback';
      const verifier = makeCodeVerifier();
      const challenge = makeCodeChallenge(verifier);

      // Step 1: Create authorization code
      const { code } = server.createAuthorizationCode({
        clientId,
        redirectUri,
        userId: 'mcp-user',
        scopes: ['mcp:read', 'mcp:write'],
        codeChallenge: challenge,
        codeChallengeMethod: 'S256',
      });

      // Step 2: Consume code + verify PKCE
      const authCode = server.consumeAuthorizationCode(code);
      expect(authCode).not.toBeNull();

      const pkceValid = server.verifyCodeChallenge(verifier, authCode!.codeChallenge, 'S256');
      expect(pkceValid).toBe(true);

      // Step 3: Issue access token
      const accessToken = server.createAccessToken({
        clientId: authCode!.clientId,
        userId: authCode!.userId,
        scopes: authCode!.scopes,
      });

      // Step 4: Validate token
      const validated = server.validateToken(accessToken.token);
      expect(validated?.userId).toBe('mcp-user');
      expect(validated?.scopes).toContain('mcp:read');
      expect(validated?.scopes).toContain('mcp:write');
    });
  });
});
