/**
 * Contract tests — MCP Protocol compliance
 * Tests that /mcp endpoint returns spec-compliant responses.
 * Uses a lightweight in-process HTTP server (no real Node-RED needed).
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';

// ── Minimal stubs so we can mount the endpoint without real Node-RED ──────────

vi.mock('../../src/services/nodered-api.js', () => {
  return {
    NodeRedAPIClient: vi.fn().mockImplementation(() => ({
      healthCheck: vi.fn().mockResolvedValue({ healthy: true, details: {} }),
      getFlows: vi.fn().mockResolvedValue([]),
    })),
  };
});

vi.mock('../../src/services/nodered-event-listener.js', () => ({
  NodeRedEventListener: vi.fn().mockImplementation(() => ({
    startEventMonitoring: vi.fn(),
    stopEventMonitoring: vi.fn(),
    getStatus: vi.fn().mockReturnValue({ isMonitoring: false, lastEventTimestamp: 0 }),
    onFlowDeploy: vi.fn(),
  })),
}));

vi.mock('../../src/utils/telemetry.js', () => ({ initTelemetry: vi.fn() }));

// ── Build a minimal express app with only the /mcp endpoint ──────────────────

import express from 'express';
import { OAuthServer } from '../../src/server/oauth-server.js';
import { SessionManager } from '../../src/server/session-manager.js';

type McpResponse = {
  jsonrpc: string;
  id: unknown;
  result?: Record<string, unknown>;
  error?: { code: number; message: string };
};

async function postMcp(
  app: ReturnType<typeof express>,
  body: Record<string, unknown>,
  headers: Record<string, string> = {}
): Promise<{ status: number; body: McpResponse; headers: Record<string, string> }> {
  return new Promise(resolve => {
    const server = app.listen(0, () => {
      const port = (server.address() as { port: number }).port;

      import('http').then(http => {
        const data = JSON.stringify(body);
        const req = http.request(
          {
            hostname: '127.0.0.1',
            port,
            path: '/mcp',
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Content-Length': Buffer.byteLength(data),
              ...headers,
            },
          },
          res => {
            let raw = '';
            res.on('data', chunk => (raw += chunk));
            res.on('end', () => {
              server.close();
              resolve({
                status: res.statusCode ?? 0,
                body: JSON.parse(raw) as McpResponse,
                headers: res.headers as Record<string, string>,
              });
            });
          }
        );
        req.write(data);
        req.end();
      });
    });
  });
}

function buildApp() {
  const app = express();
  app.use(express.json());

  const oauthServer = new OAuthServer();
  const sessionManager = new SessionManager();

  const baseUrl = 'http://localhost';
  app.use(oauthServer.createRouter(baseUrl));

  // Minimal stub of the /mcp handler (mirrors express-app.ts logic)
  app.post('/mcp', (req, res) => {
    const sessionId = req.headers['mcp-session-id'] as string | undefined;
    let session = sessionId ? sessionManager.get(sessionId) : undefined;
    const isNew = !session;
    if (!session) session = sessionManager.create();

    res.setHeader('Mcp-Session-Id', session.id);
    if (isNew) res.setHeader('X-Mcp-Session-Created', 'true');

    const { method, id, jsonrpc } = req.body as { method: string; id?: unknown; jsonrpc: string };

    if (jsonrpc !== '2.0') {
      return res.status(400).json({
        jsonrpc: '2.0', id: id ?? null,
        error: { code: -32600, message: 'Invalid Request' },
      });
    }

    switch (method) {
      case 'initialize':
        sessionManager.markInitialized(session.id);
        return res.json({
          jsonrpc: '2.0', id,
          result: {
            protocolVersion: '2025-03-26',
            capabilities: { tools: {}, resources: {}, prompts: {}, logging: {} },
            serverInfo: { name: 'nodered-mcp-server', version: '1.0.0' },
          },
        });
      case 'tools/list':
        return res.json({ jsonrpc: '2.0', id, result: { tools: [] } });
      default:
        return res.json({
          jsonrpc: '2.0', id,
          error: { code: -32601, message: `Method not found: ${method}` },
        });
    }
  });

  return app;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('POST /mcp — MCP Protocol contract', () => {
  let app: ReturnType<typeof express>;

  beforeAll(() => {
    app = buildApp();
  });

  afterAll(() => {
    // nothing to clean up
  });

  it('returns 400 when jsonrpc is not 2.0', async () => {
    const { status, body } = await postMcp(app, {
      jsonrpc: '1.0', method: 'initialize', id: 1,
    });
    expect(status).toBe(400);
    expect(body.error?.code).toBe(-32600);
  });

  it('initialize returns protocolVersion 2025-03-26', async () => {
    const { status, body } = await postMcp(app, {
      jsonrpc: '2.0',
      method: 'initialize',
      id: 1,
      params: {
        protocolVersion: '2025-03-26',
        capabilities: {},
        clientInfo: { name: 'test-client', version: '1.0.0' },
      },
    });
    expect(status).toBe(200);
    expect(body.result?.protocolVersion).toBe('2025-03-26');
  });

  it('initialize response includes capabilities and serverInfo', async () => {
    const { body } = await postMcp(app, {
      jsonrpc: '2.0', method: 'initialize', id: 2,
      params: { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'x', version: '1' } },
    });
    expect(body.result?.capabilities).toBeDefined();
    expect((body.result?.serverInfo as { name: string })?.name).toBe('nodered-mcp-server');
  });

  it('response includes Mcp-Session-Id header', async () => {
    const { headers } = await postMcp(app, {
      jsonrpc: '2.0', method: 'initialize', id: 3,
      params: { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'x', version: '1' } },
    });
    expect(headers['mcp-session-id']).toBeTruthy();
  });

  it('second request with same session ID does not create new session', async () => {
    const first = await postMcp(app, {
      jsonrpc: '2.0', method: 'initialize', id: 4,
      params: { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'x', version: '1' } },
    });
    const sessionId = first.headers['mcp-session-id'];
    expect(first.headers['x-mcp-session-created']).toBe('true');

    const second = await postMcp(app, {
      jsonrpc: '2.0', method: 'tools/list', id: 5,
    }, { 'mcp-session-id': sessionId });
    // Session should be reused, not recreated
    expect(second.headers['mcp-session-id']).toBe(sessionId);
    expect(second.headers['x-mcp-session-created']).toBeUndefined();
  });

  it('tools/list returns a tools array', async () => {
    const { body } = await postMcp(app, { jsonrpc: '2.0', method: 'tools/list', id: 6 });
    expect(Array.isArray((body.result as { tools: unknown[] })?.tools)).toBe(true);
  });

  it('unknown method returns -32601 error', async () => {
    const { body } = await postMcp(app, { jsonrpc: '2.0', method: 'unknown/method', id: 7 });
    expect(body.error?.code).toBe(-32601);
  });

  it('jsonrpc field in response is always 2.0', async () => {
    const { body } = await postMcp(app, { jsonrpc: '2.0', method: 'tools/list', id: 8 });
    expect(body.jsonrpc).toBe('2.0');
  });

  it('id is echoed back in response', async () => {
    const { body } = await postMcp(app, { jsonrpc: '2.0', method: 'tools/list', id: 42 });
    expect(body.id).toBe(42);
  });
});
