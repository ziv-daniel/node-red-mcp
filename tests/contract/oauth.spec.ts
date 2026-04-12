/**
 * Contract tests — OAuth 2.0 Authorization Server
 * Validates RFC 6749 + PKCE (RFC 7636) compliance
 */

import { createHash, randomBytes } from 'crypto';
import { describe, it, expect, beforeEach } from 'vitest';

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
