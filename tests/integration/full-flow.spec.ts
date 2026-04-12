/**
 * Integration test — Full Claude.ai connection flow
 *
 * Spins up a real HTTP server (no mock Claude.ai needed) and runs
 * MockClaudeClient through the entire OAuth + MCP handshake.
 */

import http from 'http';
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';

// ── Stubs (no real Node-RED required) ────────────────────────────────────────

vi.mock('../../src/services/nodered-api.js', () => ({
  NodeRedAPIClient: vi.fn().mockImplementation(() => ({
    healthCheck: vi.fn().mockResolvedValue({ healthy: true, details: {} }),
    getFlows: vi.fn().mockResolvedValue([]),
  })),
}));

vi.mock('../../src/services/nodered-event-listener.js', () => ({
  NodeRedEventListener: vi.fn().mockImplementation(() => ({
    startEventMonitoring: vi.fn(),
    stopEventMonitoring: vi.fn(),
    getStatus: vi.fn().mockReturnValue({ isMonitoring: false, lastEventTimestamp: 0 }),
    onFlowDeploy: vi.fn(),
  })),
}));

vi.mock('../../src/utils/telemetry.js', () => ({ initTelemetry: vi.fn() }));

// ── Build minimal app ─────────────────────────────────────────────────────────

import express from 'express';
import { OAuthServer } from '../../src/server/oauth-server.js';
import { SessionManager } from '../../src/server/session-manager.js';
import { MockClaudeClient } from './mock-claude-client.js';

function buildTestApp(oauthServer: OAuthServer, sessionManager: SessionManager, baseUrl: string) {
  const app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use(oauthServer.createRouter(baseUrl));

  // Minimal /mcp endpoint
  app.post('/mcp', (req, res) => {
    const sessionId = req.headers['mcp-session-id'] as string | undefined;
    let session = sessionId ? sessionManager.get(sessionId) : undefined;
    const isNew = !session;

    // Validate bearer token
    const auth = req.headers.authorization as string | undefined;
    let userId: string | undefined;
    if (auth?.startsWith('Bearer ')) {
      const tokenData = oauthServer.validateToken(auth.slice(7));
      if (tokenData) userId = tokenData.userId;
    }

    if (!session) session = sessionManager.create(userId);
    res.setHeader('Mcp-Session-Id', session.id);
    if (isNew) res.setHeader('X-Mcp-Session-Created', 'true');

    const { method, id, jsonrpc, params } = req.body as {
      method: string;
      id?: unknown;
      jsonrpc: string;
      params?: { clientInfo?: { name: string; version: string } };
    };

    if (jsonrpc !== '2.0') {
      return res
        .status(400)
        .json({ jsonrpc: '2.0', id, error: { code: -32600, message: 'Invalid Request' } });
    }

    switch (method) {
      case 'initialize':
        sessionManager.markInitialized(session.id);
        return res.json({
          jsonrpc: '2.0',
          id,
          result: {
            protocolVersion: '2025-03-26',
            capabilities: { tools: {}, resources: {}, prompts: {}, logging: {} },
            serverInfo: { name: 'nodered-mcp-server', version: '1.0.0' },
          },
        });
      case 'tools/list':
        return res.json({
          jsonrpc: '2.0',
          id,
          result: {
            tools: [
              {
                name: 'get_flows',
                description: 'Get Node-RED flows',
                inputSchema: { type: 'object', properties: {} },
              },
            ],
          },
        });
      default:
        return res.json({
          jsonrpc: '2.0',
          id,
          error: { code: -32601, message: `Method not found: ${method}` },
        });
    }
  });

  // Loopback OAuth callback (captures the redirect for testing)
  app.get('/oauth/callback', (req, res) => {
    res.json({ code: req.query['code'], state: req.query['state'] });
  });

  return app;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('Full Claude.ai connection flow', () => {
  let server: http.Server;
  let baseUrl: string;

  beforeAll(async () => {
    // Skip Node-RED credential validation in integration tests (no real Node-RED)
    process.env.NODERED_SKIP_CREDENTIAL_VALIDATION = 'true';

    const oauthServer = new OAuthServer();
    const sessionManager = new SessionManager();

    await new Promise<void>(resolve => {
      const tempApp = express(); // placeholder to get port
      server = http.createServer(tempApp);
      server.listen(0, '127.0.0.1', () => {
        const port = (server.address() as { port: number }).port;
        baseUrl = `http://127.0.0.1:${port}`;

        // Rebuild with real baseUrl now we have the port
        const app = buildTestApp(oauthServer, sessionManager, baseUrl);
        server.removeAllListeners('request');
        server.on('request', app);
        resolve();
      });
    });
  });

  afterAll(() => {
    server?.close();
  });

  it('MockClaudeClient completes full OAuth + MCP flow', async () => {
    const client = new MockClaudeClient({ baseUrl });
    const result = await client.connect();

    expect(result.errors).toEqual([]);
    expect(result.success).toBe(true);
  }, 10_000);

  it('receives a valid access token', async () => {
    const client = new MockClaudeClient({ baseUrl });
    const result = await client.connect();
    expect(result.accessToken).toBeTruthy();
    expect(typeof result.accessToken).toBe('string');
  }, 10_000);

  it('receives a session ID after initialize', async () => {
    const client = new MockClaudeClient({ baseUrl });
    const result = await client.connect();
    expect(result.sessionId).toBeTruthy();
  }, 10_000);

  it('server returns protocolVersion 2025-03-26', async () => {
    const client = new MockClaudeClient({ baseUrl });
    const result = await client.connect();
    expect(result.protocolVersion).toBe('2025-03-26');
  }, 10_000);

  it('tools/list returns at least one tool', async () => {
    const client = new MockClaudeClient({ baseUrl });
    const result = await client.connect();
    expect(Array.isArray(result.tools)).toBe(true);
    expect((result.tools ?? []).length).toBeGreaterThan(0);
  }, 10_000);
});
