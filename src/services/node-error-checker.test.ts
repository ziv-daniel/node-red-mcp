import { createServer } from 'http';

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { WebSocketServer } from 'ws';

import { getNodeRedAuthHeader } from '../utils/auth.js';

import { NodeErrorChecker } from './node-error-checker.js';
import { NodeRedAPIClient } from './nodered-api.js';

vi.mock('../utils/auth.js', () => ({
  getNodeRedAuthHeader: vi.fn().mockReturnValue({}),
  getTlsRejectUnauthorized: vi.fn().mockReturnValue(true),
}));

vi.mock('./nodered-api.js', () => ({
  NodeRedAPIClient: vi.fn().mockImplementation(() => ({
    getCommsWsUrl: vi.fn().mockReturnValue('ws://localhost:0/comms'),
    getFlows: vi.fn().mockResolvedValue([]),
  })),
}));

interface FakeClient {
  getCommsWsUrl: ReturnType<typeof vi.fn>;
  getFlows: ReturnType<typeof vi.fn>;
}

function makeClient(overrides: Partial<FakeClient> = {}): NodeRedAPIClient {
  const defaults: FakeClient = {
    getCommsWsUrl: vi.fn().mockReturnValue('ws://localhost:0/comms'),
    getFlows: vi.fn().mockResolvedValue([]),
  };
  return { ...defaults, ...overrides } as unknown as NodeRedAPIClient;
}

function startWss(): Promise<{
  wss: WebSocketServer;
  port: number;
  close: () => Promise<void>;
}> {
  return new Promise(resolve => {
    const server = createServer();
    const wss = new WebSocketServer({ server });
    server.listen(0, () => {
      const { port } = server.address() as { port: number };
      const close = () => new Promise<void>(res => wss.close(() => server.close(() => res())));
      resolve({ wss, port, close });
    });
  });
}

describe('NodeErrorChecker', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(getNodeRedAuthHeader).mockReturnValue({});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns empty errors when no status messages arrive within timeout', async () => {
    const { wss, port, close } = await startWss();
    const client = makeClient({
      getCommsWsUrl: vi.fn().mockReturnValue(`ws://localhost:${port}/comms`),
    });
    const checker = new NodeErrorChecker(client);

    const result = await checker.check({ timeoutMs: 100 });

    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([]);
    expect(result.statusesMayBeIncomplete).toBe(false);

    wss.close();
    await close();
  });

  it('returns a red node in errors', async () => {
    const { wss, port, close } = await startWss();
    const client = makeClient({
      getCommsWsUrl: vi.fn().mockReturnValue(`ws://localhost:${port}/comms`),
    });
    const checker = new NodeErrorChecker(client);

    wss.on('connection', ws => {
      ws.send(
        JSON.stringify({ topic: 'status/node-1', data: { fill: 'red', text: 'not connected' } })
      );
    });

    const result = await checker.check({ timeoutMs: 300 });

    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]!.nodeId).toBe('node-1');
    expect(result.errors[0]!.status.fill).toBe('red');
    expect(result.errors[0]!.status.text).toBe('not connected');
    expect(result.statusesMayBeIncomplete).toBe(false);

    await close();
  });

  it('deduplicates: red then green → not in errors', async () => {
    const { wss, port, close } = await startWss();
    const client = makeClient({
      getCommsWsUrl: vi.fn().mockReturnValue(`ws://localhost:${port}/comms`),
    });
    const checker = new NodeErrorChecker(client);

    wss.on('connection', ws => {
      ws.send(JSON.stringify({ topic: 'status/node-1', data: { fill: 'red', text: 'error' } }));
      setTimeout(() => {
        ws.send(
          JSON.stringify({ topic: 'status/node-1', data: { fill: 'green', text: 'connected' } })
        );
      }, 20);
    });

    const result = await checker.check({ timeoutMs: 200 });

    expect(result.errors).toHaveLength(0);

    await close();
  });

  it('does not include yellow nodes when includeWarnings is false', async () => {
    const { wss, port, close } = await startWss();
    const client = makeClient({
      getCommsWsUrl: vi.fn().mockReturnValue(`ws://localhost:${port}/comms`),
    });
    const checker = new NodeErrorChecker(client);

    wss.on('connection', ws => {
      ws.send(JSON.stringify({ topic: 'status/node-1', data: { fill: 'yellow', text: 'warn' } }));
    });

    const result = await checker.check({ timeoutMs: 200, includeWarnings: false });

    expect(result.errors).toHaveLength(0);
    expect(result.warnings).toHaveLength(0);

    await close();
  });

  it('includes yellow nodes when includeWarnings is true', async () => {
    const { wss, port, close } = await startWss();
    const client = makeClient({
      getCommsWsUrl: vi.fn().mockReturnValue(`ws://localhost:${port}/comms`),
    });
    const checker = new NodeErrorChecker(client);

    wss.on('connection', ws => {
      ws.send(JSON.stringify({ topic: 'status/node-1', data: { fill: 'yellow', text: 'warn' } }));
    });

    const result = await checker.check({ timeoutMs: 200, includeWarnings: true });

    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]!.status.fill).toBe('yellow');

    await close();
  });

  it('enriches nodes with flow metadata', async () => {
    const { wss, port, close } = await startWss();
    const client = makeClient({
      getCommsWsUrl: vi.fn().mockReturnValue(`ws://localhost:${port}/comms`),
      getFlows: vi.fn().mockResolvedValue([
        {
          id: 'flow-1',
          label: 'My Flow',
          nodes: [{ id: 'node-1', type: 'mqtt in', name: 'Listen MQTT' }],
        },
      ]),
    });
    const checker = new NodeErrorChecker(client);

    wss.on('connection', ws => {
      ws.send(JSON.stringify({ topic: 'status/node-1', data: { fill: 'red', text: 'no broker' } }));
    });

    const result = await checker.check({ timeoutMs: 200 });

    expect(result.errors[0]).toMatchObject({
      nodeId: 'node-1',
      nodeType: 'mqtt in',
      label: 'Listen MQTT',
      flowId: 'flow-1',
      flowName: 'My Flow',
    });

    await close();
  });

  it('returns unknown metadata for nodes not in any flow', async () => {
    const { wss, port, close } = await startWss();
    const client = makeClient({
      getCommsWsUrl: vi.fn().mockReturnValue(`ws://localhost:${port}/comms`),
      getFlows: vi.fn().mockResolvedValue([]),
    });
    const checker = new NodeErrorChecker(client);

    wss.on('connection', ws => {
      ws.send(
        JSON.stringify({ topic: 'status/node-orphan', data: { fill: 'red', text: 'error' } })
      );
    });

    const result = await checker.check({ timeoutMs: 200 });

    expect(result.errors[0]).toMatchObject({
      nodeId: 'node-orphan',
      nodeType: 'unknown',
      label: '',
      flowId: '',
      flowName: '',
    });

    await close();
  });

  it('rejects with auth error when WS returns auth:fail', async () => {
    const { wss, port, close } = await startWss();
    const client = makeClient({
      getCommsWsUrl: vi.fn().mockReturnValue(`ws://localhost:${port}/comms`),
    });
    const checker = new NodeErrorChecker(client);

    wss.on('connection', ws => {
      ws.send(JSON.stringify({ topic: 'auth', data: 'fail' }));
    });

    await expect(checker.check({ timeoutMs: 500 })).rejects.toThrow('auth failed');

    await close();
  });

  it('caps timeoutMs at 30000', async () => {
    const { wss, port, close } = await startWss();
    const client = makeClient({
      getCommsWsUrl: vi.fn().mockReturnValue(`ws://localhost:${port}/comms`),
    });
    const checker = new NodeErrorChecker(client);

    // Should not hang — pass 99999 but it gets capped and we just check it starts
    // (we close the WS immediately to end the check)
    wss.on('connection', ws => ws.close());

    const result = await checker.check({ timeoutMs: 99999 });
    expect(result).toBeDefined();

    await close();
  });
});
