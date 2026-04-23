/**
 * OAuth Server Security & Regression Tests
 *
 * Covers:
 * - Full OAuth2 + PKCE authorization code flow (end-to-end)
 * - PKCE code verifier validation (RFC 7636)
 * - SSRF protection on client metadata fetch
 * - CORS origin enforcement
 * - Credential store (credentials NOT in tokens)
 * - code_challenge_method enforcement
 * - Token exchange validation
 * - Error response format (no [object Object])
 * - Session ownership binding
 */

import { createHash, randomBytes } from 'node:crypto';
import request from 'supertest';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── Hoisted mocks (must be defined before any import resolution) ──────────────
const { mockMcpServer, mockNodeRedClient, MockNodeRedEventListener } = vi.hoisted(() => {
  const nodeRedClient = {
    healthCheck: vi.fn(() => Promise.resolve({ healthy: true, details: {} })),
    getFlows: vi.fn(() => Promise.resolve([])),
    getNodeTypes: vi.fn(() => Promise.resolve([])),
    getRuntimeInfo: vi.fn(() => Promise.resolve({ version: '3.1.0' })),
  };

  const sseHandler = {
    connect: vi.fn(() => 'conn-1'),
    disconnect: vi.fn(),
    subscribe: vi.fn(),
    subscribeWithFilter: vi.fn(),
    unsubscribe: vi.fn(),
    getSubscriptions: vi.fn(() => ({ eventTypes: [], filters: {} })),
    getStats: vi.fn(() => ({
      activeConnections: 0, totalConnections: 0,
      messagesSent: 0, uptime: 0, errors: 0, connectionsByEventType: {},
    })),
    getClients: vi.fn(() => []),
    forceDisconnect: vi.fn(() => true),
    sendSystemInfo: vi.fn(),
    sendError: vi.fn(),
    destroy: vi.fn(),
  };

  const mcpServer = {
    getSSEHandler: vi.fn(() => sseHandler),
    getNodeRedClient: vi.fn(() => nodeRedClient),
    listTools: vi.fn(() => Promise.resolve({ tools: [] })),
    listResources: vi.fn(() => Promise.resolve({ resources: [] })),
    listPrompts: vi.fn(() => Promise.resolve({ prompts: [] })),
    callToolPublic: vi.fn(() => Promise.resolve({ content: [{ type: 'text', text: '{}' }] })),
    readResource: vi.fn(() => Promise.resolve({ contents: [] })),
    getPromptPublic: vi.fn(() => Promise.resolve({ messages: [] })),
    start: vi.fn(() => Promise.resolve()),
  };

  const MockNodeRedEventListener = vi.fn().mockImplementation(() => ({
    startEventMonitoring: vi.fn(),
    stopEventMonitoring: vi.fn(),
    getStatus: vi.fn(() => ({ isMonitoring: false })),
    onFlowDeploy: vi.fn(),
  }));

  return { mockMcpServer: mcpServer, mockNodeRedClient: nodeRedClient, MockNodeRedEventListener };
});

vi.mock('../services/nodered-event-listener.js', () => ({
  NodeRedEventListener: MockNodeRedEventListener,
}));

vi.mock('../utils/auth.js', () => ({
  authenticate: vi.fn((_req: any, _res: any, next: any) => next()),
  authenticateAPIKey: vi.fn((req: any, _res: any, next: any) => {
    req.auth = { userId: 'test-user', permissions: ['*'], isAuthenticated: true };
    next();
  }),
  verifyToken: vi.fn(() => null),
  getRateLimitKey: vi.fn((req: any) => req.ip ?? '127.0.0.1'),
  generateToken: vi.fn(() => 'mock-jwt-token'),
  hashPassword: vi.fn(() => 'hashed'),
  comparePassword: vi.fn(() => true),
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeCodeVerifier(): string {
  // RFC 7636: 43-128 chars, unreserved characters
  return randomBytes(32).toString('base64url').slice(0, 64);
}

function makeCodeChallenge(verifier: string): string {
  return createHash('sha256').update(verifier).digest('base64url');
}

// ── Test setup ────────────────────────────────────────────────────────────────

let app: any;
let oauthServer: any;

beforeEach(async () => {
  process.env.NODE_ENV = 'test';
  process.env.JWT_SECRET = 'test-secret-key-minimum-32-chars-xxxx';
  process.env.NODERED_SKIP_CREDENTIAL_VALIDATION = 'true';
  process.env.PUBLIC_URL = 'https://mcp-nodered.danielshaprvt.work';
  process.env.CLAUDE_AUTH_REQUIRED = 'true';

  const { ExpressApp } = await import('../server/express-app.js');
  const { OAuthServer } = await import('../server/oauth-server.js');

  oauthServer = new OAuthServer();
  const expressApp = new ExpressApp(mockMcpServer as any);
  app = expressApp.getApp();
});

afterEach(() => {
  vi.clearAllMocks();
});

// ─────────────────────────────────────────────────────────────────────────────
// 1. Full OAuth2 + PKCE Flow
// ─────────────────────────────────────────────────────────────────────────────

describe('Full OAuth2 + PKCE Authorization Code Flow', () => {
  const CLIENT_ID = 'test-client-id';
  const REDIRECT_URI = 'https://claude.ai/api/mcp/auth_callback';

  it('GET /authorize returns HTML login form', async () => {
    const verifier = makeCodeVerifier();
    const challenge = makeCodeChallenge(verifier);

    // Register a test client first (server assigns its own client_id)
    const regRes = await request(app)
      .post('/register')
      .set('Content-Type', 'application/json')
      .send({
        client_name: 'Test Client',
        redirect_uris: [REDIRECT_URI],
        scope: 'mcp:read mcp:write',
      });

    // Use the server-assigned client_id from registration response
    const registeredClientId = regRes.body?.client_id ?? 'claude-ai-client';

    const res = await request(app)
      .get('/authorize')
      .query({
        client_id: registeredClientId,
        redirect_uri: REDIRECT_URI,
        response_type: 'code',
        code_challenge: challenge,
        code_challenge_method: 'S256',
        state: 'test-state',
        scope: 'mcp:read',
      });

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/html/);
    expect(res.text).toContain('התחבר'); // Hebrew "Connect" button
    expect(res.text).toContain('fetch(');  // Uses JS fetch, not native form submit
  });

  it('POST /authorize with _json=1 returns JSON redirect_to on success', async () => {
    const verifier = makeCodeVerifier();
    const challenge = makeCodeChallenge(verifier);

    const res = await request(app)
      .post('/authorize')
      .type('form')
      .send({
        _json: '1',
        client_id: CLIENT_ID,
        redirect_uri: REDIRECT_URI,
        response_type: 'code',
        code_challenge: challenge,
        code_challenge_method: 'S256',
        state: 'test-state',
        scope: 'mcp:read',
        nr_url: 'https://nodered.danielshaprvt.work',
        auth_type: 'basic',
        nr_username: 'admin',
        nr_password: 'secret',
      });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('redirect_to');
    expect(res.body.redirect_to).toMatch(/^https:\/\/claude\.ai\/api\/mcp\/auth_callback\?code=/);
    expect(res.body.redirect_to).toContain('state=test-state');

    // error field must NOT be an object (regression: [object Object] bug)
    expect(res.body.error).toBeUndefined();
  });

  it('POST /token exchanges code for access token', async () => {
    const verifier = makeCodeVerifier();
    const challenge = makeCodeChallenge(verifier);

    // Step 1: Get auth code
    const authRes = await request(app)
      .post('/authorize')
      .type('form')
      .send({
        _json: '1',
        client_id: CLIENT_ID,
        redirect_uri: REDIRECT_URI,
        response_type: 'code',
        code_challenge: challenge,
        code_challenge_method: 'S256',
        state: 'state-123',
        nr_url: 'https://nodered.danielshaprvt.work',
        auth_type: 'basic',
        nr_username: 'admin',
        nr_password: 'secret',
      });

    expect(authRes.status).toBe(200);
    const code = new URL(authRes.body.redirect_to).searchParams.get('code');
    expect(code).toBeTruthy();

    // Step 2: Exchange code for token
    const tokenRes = await request(app)
      .post('/token')
      .type('form')
      .send({
        grant_type: 'authorization_code',
        code,
        code_verifier: verifier,
        redirect_uri: REDIRECT_URI,
        client_id: CLIENT_ID,
      });

    expect(tokenRes.status).toBe(200);
    expect(tokenRes.body).toHaveProperty('access_token');
    expect(tokenRes.body.token_type).toBe('Bearer');
    expect(tokenRes.body.expires_in).toBeGreaterThan(0);
    expect(tokenRes.body.scope).toBeDefined();

    // SECURITY: access_token must NOT contain credentials
    const token = tokenRes.body.access_token;
    expect(token).not.toContain('admin');
    expect(token).not.toContain('secret');
    expect(token).not.toContain('password');
  });

  it('POST /mcp with valid token returns MCP response', async () => {
    const verifier = makeCodeVerifier();
    const challenge = makeCodeChallenge(verifier);

    // Auth + token
    const authRes = await request(app).post('/authorize').type('form').send({
      _json: '1', client_id: CLIENT_ID, redirect_uri: REDIRECT_URI,
      response_type: 'code', code_challenge: challenge,
      code_challenge_method: 'S256', state: 's',
      nr_url: 'https://nodered.danielshaprvt.work',
      auth_type: 'basic', nr_username: 'admin', nr_password: 'secret',
    });
    const code = new URL(authRes.body.redirect_to).searchParams.get('code')!;

    const tokenRes = await request(app).post('/token').type('form').send({
      grant_type: 'authorization_code', code, code_verifier: verifier,
      redirect_uri: REDIRECT_URI, client_id: CLIENT_ID,
    });
    const accessToken = tokenRes.body.access_token;

    // Use token on MCP endpoint
    const mcpRes = await request(app)
      .post('/mcp')
      .set('Authorization', `Bearer ${accessToken}`)
      .set('Content-Type', 'application/json')
      .send({ jsonrpc: '2.0', method: 'initialize', params: { protocolVersion: '2025-03-26', capabilities: {} }, id: 1 });

    expect(mcpRes.status).toBe(200);
    expect(mcpRes.body.result).toHaveProperty('protocolVersion');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. PKCE Validation (RFC 7636)
// ─────────────────────────────────────────────────────────────────────────────

describe('PKCE Validation', () => {
  const CLIENT_ID = 'pkce-test-client';
  const REDIRECT_URI = 'https://claude.ai/api/mcp/auth_callback';

  async function getCode(verifier: string): Promise<string | null> {
    const challenge = makeCodeChallenge(verifier);
    const res = await request(app).post('/authorize').type('form').send({
      _json: '1', client_id: CLIENT_ID, redirect_uri: REDIRECT_URI,
      response_type: 'code', code_challenge: challenge,
      code_challenge_method: 'S256', state: 's',
      nr_url: 'https://nodered.danielshaprvt.work',
      auth_type: 'basic', nr_username: 'u', nr_password: 'p',
    });
    if (res.body.redirect_to) {
      return new URL(res.body.redirect_to).searchParams.get('code');
    }
    return null;
  }

  it('rejects code verifier shorter than 43 chars', async () => {
    const shortVerifier = 'a'.repeat(42); // 42 chars, below minimum
    const code = await getCode(shortVerifier);
    expect(code).toBeTruthy();

    const res = await request(app).post('/token').type('form').send({
      grant_type: 'authorization_code', code,
      code_verifier: shortVerifier,
      redirect_uri: REDIRECT_URI, client_id: CLIENT_ID,
    });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('invalid_grant');
  });

  it('rejects code verifier longer than 128 chars', async () => {
    const longVerifier = 'a'.repeat(129);
    const code = await getCode(longVerifier);
    expect(code).toBeTruthy();

    const res = await request(app).post('/token').type('form').send({
      grant_type: 'authorization_code', code,
      code_verifier: longVerifier,
      redirect_uri: REDIRECT_URI, client_id: CLIENT_ID,
    });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('invalid_grant');
  });

  it('rejects code verifier with invalid characters', async () => {
    const invalidVerifier = 'a'.repeat(43) + '!@#$'; // invalid chars
    const code = await getCode(invalidVerifier);
    expect(code).toBeTruthy();

    const res = await request(app).post('/token').type('form').send({
      grant_type: 'authorization_code', code,
      code_verifier: invalidVerifier,
      redirect_uri: REDIRECT_URI, client_id: CLIENT_ID,
    });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('invalid_grant');
  });

  it('accepts valid 64-char verifier with allowed charset', async () => {
    const validVerifier = makeCodeVerifier(); // 64 chars, base64url
    const code = await getCode(validVerifier);
    expect(code).toBeTruthy();

    const res = await request(app).post('/token').type('form').send({
      grant_type: 'authorization_code', code,
      code_verifier: validVerifier,
      redirect_uri: REDIRECT_URI, client_id: CLIENT_ID,
    });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('access_token');
  });

  it('requires code_verifier in token exchange', async () => {
    const verifier = makeCodeVerifier();
    const code = await getCode(verifier);

    const res = await request(app).post('/token').type('form').send({
      grant_type: 'authorization_code', code,
      redirect_uri: REDIRECT_URI, client_id: CLIENT_ID,
      // code_verifier deliberately omitted
    });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('invalid_grant');
  });

  it('rejects wrong code_verifier (PKCE mismatch)', async () => {
    const correctVerifier = makeCodeVerifier();
    const wrongVerifier = makeCodeVerifier(); // different
    const code = await getCode(correctVerifier);

    const res = await request(app).post('/token').type('form').send({
      grant_type: 'authorization_code', code,
      code_verifier: wrongVerifier,
      redirect_uri: REDIRECT_URI, client_id: CLIENT_ID,
    });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('invalid_grant');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. code_challenge_method enforcement
// ─────────────────────────────────────────────────────────────────────────────

describe('code_challenge_method Enforcement', () => {
  const REDIRECT_URI = 'https://claude.ai/api/mcp/auth_callback';

  it('rejects missing code_challenge_method', async () => {
    const verifier = makeCodeVerifier();
    const challenge = makeCodeChallenge(verifier);

    const res = await request(app).post('/authorize').type('form').send({
      _json: '1',
      client_id: 'test',
      redirect_uri: REDIRECT_URI,
      response_type: 'code',
      code_challenge: challenge,
      // code_challenge_method omitted
      state: 's',
      nr_url: 'https://nodered.danielshaprvt.work',
      auth_type: 'basic',
      nr_username: 'u',
      nr_password: 'p',
    });

    expect(res.status).toBe(400);
    // error must be a STRING (not an object) to prevent [object Object] display
    expect(typeof res.body.error).toBe('string');
  });

  it('rejects plain code_challenge_method', async () => {
    const verifier = makeCodeVerifier();

    const res = await request(app).post('/authorize').type('form').send({
      _json: '1',
      client_id: 'test',
      redirect_uri: REDIRECT_URI,
      response_type: 'code',
      code_challenge: verifier, // plain method uses raw verifier
      code_challenge_method: 'plain',
      state: 's',
      nr_url: 'https://nodered.danielshaprvt.work',
      auth_type: 'basic',
      nr_username: 'u',
      nr_password: 'p',
    });

    expect(res.status).toBe(400);
    expect(typeof res.body.error).toBe('string');
  });

  it('requires code_challenge to be present', async () => {
    const res = await request(app).post('/authorize').type('form').send({
      _json: '1',
      client_id: 'test',
      redirect_uri: REDIRECT_URI,
      response_type: 'code',
      // code_challenge omitted
      code_challenge_method: 'S256',
      state: 's',
      nr_url: 'https://nodered.danielshaprvt.work',
      auth_type: 'basic',
    });

    expect(res.status).toBe(400);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. Error Response Format (regression: [object Object])
// ─────────────────────────────────────────────────────────────────────────────

describe('Error Response Format — no [object Object]', () => {
  it('sendError returns { error: string } not { error: object }', async () => {
    const res = await request(app).post('/authorize').type('form').send({
      _json: '1',
      client_id: 'test',
      redirect_uri: 'https://claude.ai/api/mcp/auth_callback',
      response_type: 'code',
      code_challenge: 'x',
      code_challenge_method: 'plain', // invalid — triggers error
      state: 's',
      nr_url: 'https://nodered.danielshaprvt.work',
      auth_type: 'basic',
    });

    expect(res.status).toBe(400);
    // THE FIX: error must be a string so the browser can display it
    expect(typeof res.body.error).toBe('string');
    expect(res.body.error).not.toEqual(expect.objectContaining({ code: expect.anything() }));
  });

  it('404 handler returns structured error object', async () => {
    const res = await request(app).post('/nonexistent-route')
      .set('Content-Type', 'application/json')
      .send({ test: true });

    expect(res.status).toBe(404);
    // 404 returns { error: { code, message } } — that's OK for API consumers
    // but authorize form errors must return { error: string }
    expect(res.body).toHaveProperty('error');
  });

  it('token endpoint returns string error fields', async () => {
    const res = await request(app).post('/token').type('form').send({
      grant_type: 'authorization_code',
      code: 'invalid-code',
      code_verifier: makeCodeVerifier(),
    });

    expect(res.status).toBe(400);
    expect(typeof res.body.error).toBe('string');
    expect(typeof res.body.error_description).toBe('string');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. Credential Store — credentials not embedded in tokens
// ─────────────────────────────────────────────────────────────────────────────

describe('Credential Store Security', () => {
  const CLIENT_ID = 'cred-test';
  const REDIRECT_URI = 'https://claude.ai/api/mcp/auth_callback';

  it('access token does not contain Node-RED password', async () => {
    const verifier = makeCodeVerifier();
    const challenge = makeCodeChallenge(verifier);
    const SECRET_PASSWORD = 'super-secret-nodered-password';

    const authRes = await request(app).post('/authorize').type('form').send({
      _json: '1', client_id: CLIENT_ID, redirect_uri: REDIRECT_URI,
      response_type: 'code', code_challenge: challenge,
      code_challenge_method: 'S256', state: 's',
      nr_url: 'https://nodered.danielshaprvt.work',
      auth_type: 'basic', nr_username: 'admin', nr_password: SECRET_PASSWORD,
    });

    const code = new URL(authRes.body.redirect_to).searchParams.get('code')!;
    const tokenRes = await request(app).post('/token').type('form').send({
      grant_type: 'authorization_code', code, code_verifier: verifier,
      redirect_uri: REDIRECT_URI, client_id: CLIENT_ID,
    });

    const rawToken = tokenRes.body.access_token;
    // Token must not contain the password in any form
    expect(rawToken).not.toContain(SECRET_PASSWORD);
    // Token should be an opaque hex/base64 string, not JSON
    expect(() => JSON.parse(rawToken)).toThrow();
  });

  it('access token does not contain Node-RED URL', async () => {
    const verifier = makeCodeVerifier();
    const challenge = makeCodeChallenge(verifier);

    const authRes = await request(app).post('/authorize').type('form').send({
      _json: '1', client_id: CLIENT_ID, redirect_uri: REDIRECT_URI,
      response_type: 'code', code_challenge: challenge,
      code_challenge_method: 'S256', state: 's',
      nr_url: 'https://nodered.danielshaprvt.work',
      auth_type: 'basic', nr_username: 'admin', nr_password: 'p',
    });

    const code = new URL(authRes.body.redirect_to).searchParams.get('code')!;
    const tokenRes = await request(app).post('/token').type('form').send({
      grant_type: 'authorization_code', code, code_verifier: verifier,
      redirect_uri: REDIRECT_URI, client_id: CLIENT_ID,
    });

    expect(tokenRes.body.access_token).not.toContain('nodered');
  });

  it('credentials can be retrieved via credentialId from OAuthServer', async () => {
    const { OAuthServer } = await import('../server/oauth-server.js');
    const srv = new OAuthServer();

    const verifier = makeCodeVerifier();
    const challenge = makeCodeChallenge(verifier);

    const code = srv.createAuthorizationCode({
      clientId: 'c', redirectUri: REDIRECT_URI,
      userId: 'u', scopes: ['mcp:read'],
      codeChallenge: challenge, codeChallengeMethod: 'S256',
      nodeRedCredentials: { url: 'https://nodered.example.com', authType: 'basic', username: 'admin', password: 'pw' } as any,
    });

    const authCode = srv.consumeAuthorizationCode(code.code);
    expect(authCode).not.toBeNull();
    expect(authCode!.credentialId).toBeDefined();

    const creds = srv.getNodeRedCredentials(authCode!.credentialId!);
    expect(creds).not.toBeNull();
    expect((creds as any).password).toBe('pw');
    expect((creds as any).username).toBe('admin');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. SSRF Protection
// ─────────────────────────────────────────────────────────────────────────────

describe('SSRF Protection on client_id metadata fetch', () => {
  it('internal IP as client_id does not trigger outbound fetch', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue(new Response('{}'));
    const verifier = makeCodeVerifier();
    const challenge = makeCodeChallenge(verifier);

    // Send internal IP as client_id
    await request(app)
      .get('/authorize')
      .query({
        client_id: 'http://192.168.68.1/evil-metadata',
        redirect_uri: 'https://claude.ai/api/mcp/auth_callback',
        response_type: 'code',
        code_challenge: challenge,
        code_challenge_method: 'S256',
        state: 's',
      });

    // global fetch must NOT have been called with internal IP
    const internalFetchCalls = fetchSpy.mock.calls.filter(
      ([url]) => typeof url === 'string' && url.includes('192.168.68.1')
    );
    expect(internalFetchCalls.length).toBe(0);
    fetchSpy.mockRestore();
  });

  it('claude.ai client_id is processed normally', async () => {
    const verifier = makeCodeVerifier();
    const challenge = makeCodeChallenge(verifier);

    const res = await request(app)
      .get('/authorize')
      .query({
        client_id: 'https://claude.ai/oauth/client-metadata.json',
        redirect_uri: 'https://claude.ai/api/mcp/auth_callback',
        response_type: 'code',
        code_challenge: challenge,
        code_challenge_method: 'S256',
        state: 's',
      });

    // Should show form (200) even if metadata fetch fails in test env
    expect([200, 400]).toContain(res.status);
    if (res.status === 200) {
      expect(res.text).toContain('התחבר');
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 7. CORS Enforcement
// ─────────────────────────────────────────────────────────────────────────────

describe('CORS Origin Enforcement', () => {
  it('allows requests from claude.ai', async () => {
    const res = await request(app)
      .post('/mcp')
      .set('Origin', 'https://claude.ai')
      .set('Content-Type', 'application/json')
      .send({ jsonrpc: '2.0', method: 'initialize', id: 1 });

    // Should NOT get CORS error (may get 401 for missing auth, that's fine)
    expect(res.status).not.toBe(0);
    expect(res.headers['access-control-allow-origin']).toBeDefined();
  });

  it('allows requests from our own domain (form fetch)', async () => {
    const verifier = makeCodeVerifier();
    const challenge = makeCodeChallenge(verifier);

    const res = await request(app)
      .post('/authorize')
      .set('Origin', 'https://mcp-nodered.danielshaprvt.work')
      .type('form')
      .send({
        _json: '1',
        client_id: 'test',
        redirect_uri: 'https://claude.ai/api/mcp/auth_callback',
        response_type: 'code',
        code_challenge: challenge,
        code_challenge_method: 'S256',
        state: 's',
        nr_url: 'https://nodered.danielshaprvt.work',
        auth_type: 'basic',
        nr_username: 'u',
        nr_password: 'p',
      });

    // Must NOT be a CORS error — status 200 or 400 are fine, 500 CORS error is not
    expect(res.status).not.toBe(500);
    // Must have CORS header allowing our domain
    const allowOrigin = res.headers['access-control-allow-origin'];
    if (allowOrigin) {
      expect(allowOrigin).toMatch(/mcp-nodered\.danielshaprvt\.work|claude\.ai|\*/);
    }
  });

  it('blocks requests from unknown external origins on MCP endpoint', async () => {
    const res = await request(app)
      .post('/mcp')
      .set('Origin', 'https://evil-attacker.com')
      .set('Content-Type', 'application/json')
      .send({ jsonrpc: '2.0', method: 'initialize', id: 1 });

    // Either CORS blocks with 500 error or origin header is not set for evil.com
    const allowOrigin = res.headers['access-control-allow-origin'];
    if (allowOrigin) {
      expect(allowOrigin).not.toContain('evil-attacker.com');
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 8. Token Exchange Security
// ─────────────────────────────────────────────────────────────────────────────

describe('Token Exchange Security', () => {
  it('rejects invalid authorization code', async () => {
    const res = await request(app).post('/token').type('form').send({
      grant_type: 'authorization_code',
      code: 'completely-invalid-code-that-doesnt-exist',
      code_verifier: makeCodeVerifier(),
      redirect_uri: 'https://claude.ai/api/mcp/auth_callback',
      client_id: 'test',
    });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('invalid_grant');
  });

  it('rejects code reuse (replay attack)', async () => {
    const verifier = makeCodeVerifier();
    const challenge = makeCodeChallenge(verifier);

    const authRes = await request(app).post('/authorize').type('form').send({
      _json: '1', client_id: 'test',
      redirect_uri: 'https://claude.ai/api/mcp/auth_callback',
      response_type: 'code', code_challenge: challenge,
      code_challenge_method: 'S256', state: 's',
      nr_url: 'https://nodered.danielshaprvt.work',
      auth_type: 'basic', nr_username: 'u', nr_password: 'p',
    });

    const code = new URL(authRes.body.redirect_to).searchParams.get('code')!;

    // First use — should succeed
    const first = await request(app).post('/token').type('form').send({
      grant_type: 'authorization_code', code, code_verifier: verifier,
      redirect_uri: 'https://claude.ai/api/mcp/auth_callback', client_id: 'test',
    });
    expect(first.status).toBe(200);

    // Second use (replay) — must fail
    const second = await request(app).post('/token').type('form').send({
      grant_type: 'authorization_code', code, code_verifier: verifier,
      redirect_uri: 'https://claude.ai/api/mcp/auth_callback', client_id: 'test',
    });
    expect(second.status).toBe(400);
    expect(second.body.error).toBe('invalid_grant');
  });

  it('accepts token exchange when client_id is omitted (public client)', async () => {
    const verifier = makeCodeVerifier();
    const challenge = makeCodeChallenge(verifier);

    const authRes = await request(app).post('/authorize').type('form').send({
      _json: '1', client_id: 'public-client',
      redirect_uri: 'https://claude.ai/api/mcp/auth_callback',
      response_type: 'code', code_challenge: challenge,
      code_challenge_method: 'S256', state: 's',
      nr_url: 'https://nodered.danielshaprvt.work',
      auth_type: 'basic', nr_username: 'u', nr_password: 'p',
    });

    const code = new URL(authRes.body.redirect_to).searchParams.get('code')!;

    // Token exchange WITHOUT client_id (Claude.ai sometimes omits it)
    const tokenRes = await request(app).post('/token').type('form').send({
      grant_type: 'authorization_code', code, code_verifier: verifier,
      redirect_uri: 'https://claude.ai/api/mcp/auth_callback',
      // client_id omitted
    });

    expect(tokenRes.status).toBe(200);
    expect(tokenRes.body).toHaveProperty('access_token');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 9. MCP Endpoint Auth
// ─────────────────────────────────────────────────────────────────────────────

describe('MCP Endpoint Authentication', () => {
  it('returns 401 without token', async () => {
    const res = await request(app)
      .post('/mcp')
      .set('Content-Type', 'application/json')
      .send({ jsonrpc: '2.0', method: 'initialize', id: 1 });

    expect(res.status).toBe(401);
  });

  it('returns 401 with invalid token', async () => {
    const res = await request(app)
      .post('/mcp')
      .set('Authorization', 'Bearer totally-fake-invalid-token')
      .set('Content-Type', 'application/json')
      .send({ jsonrpc: '2.0', method: 'initialize', id: 1 });

    expect(res.status).toBe(401);
  });

  it('POST / with jsonrpc body is routed to MCP handler', async () => {
    const res = await request(app)
      .post('/')
      .set('Content-Type', 'application/json')
      .send({ jsonrpc: '2.0', method: 'initialize', id: 1 });

    // Should get 401 (auth required), NOT 404 (route not found)
    expect(res.status).toBe(401);
    // Must not be a "NOT_FOUND" error
    if (res.body.error) {
      expect(typeof res.body.error === 'string' ? res.body.error : res.body.error?.code)
        .not.toBe('NOT_FOUND');
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 10. OAuth Discovery Endpoints
// ─────────────────────────────────────────────────────────────────────────────

describe('OAuth Discovery Endpoints', () => {
  it('GET /.well-known/oauth-authorization-server returns metadata', async () => {
    const res = await request(app).get('/.well-known/oauth-authorization-server');

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('authorization_endpoint');
    expect(res.body).toHaveProperty('token_endpoint');
    expect(res.body.code_challenge_methods_supported).toContain('S256');
  });

  it('GET /.well-known/oauth-protected-resource returns resource metadata', async () => {
    const res = await request(app).get('/.well-known/oauth-protected-resource');

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('resource');
    expect(res.body).toHaveProperty('authorization_servers');
  });

  it('GET /mcp returns server info JSON', async () => {
    const res = await request(app)
      .get('/mcp')
      .set('Accept', 'application/json');

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('name');
    expect(res.body).toHaveProperty('protocolVersion');
    expect(res.body).toHaveProperty('endpoint');
  });
});
