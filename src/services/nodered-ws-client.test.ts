/**
 * NodeRedWsClient unit tests — uses a real in-process WS server via the 'ws' library.
 */

import { createServer } from 'http';

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { WebSocketServer, WebSocket } from 'ws';

import { SSEHandler } from '../server/sse-handler.js';
import { resolveNodeRedAuthHeader, resolveNodeRedAuthToken } from '../utils/auth.js';

import { NodeRedWsClient } from './nodered-ws-client.js';

// Silence auth util so we control what headers/token are returned
vi.mock('../utils/auth.js', () => ({
  resolveNodeRedAuthHeader: vi.fn().mockResolvedValue({}),
  resolveNodeRedAuthToken: vi.fn().mockResolvedValue(undefined),
  getTlsRejectUnauthorized: vi.fn().mockReturnValue(true),
}));

function makeSSEHandler(): { broadcast: ReturnType<typeof vi.fn> } {
  return { broadcast: vi.fn() };
}

function startWsServer(): Promise<{
  wss: WebSocketServer;
  port: number;
  close: () => Promise<void>;
}> {
  return new Promise(resolve => {
    const server = createServer();
    const wss = new WebSocketServer({ server });
    server.listen(0, () => {
      const addr = server.address() as { port: number };
      const close = () =>
        new Promise<void>(res => {
          wss.close(() => server.close(() => res()));
        });
      resolve({ wss, port: addr.port, close });
    });
  });
}

describe('NodeRedWsClient', () => {
  let mockSSE: ReturnType<typeof makeSSEHandler>;

  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    // mockReset (vitest.config) clears return values between tests; restore default.
    vi.mocked(resolveNodeRedAuthHeader).mockResolvedValue({});
    vi.mocked(resolveNodeRedAuthToken).mockResolvedValue(undefined);
    mockSSE = makeSSEHandler();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('connects to a WS server and becomes connected', async () => {
    const { wss, port, close } = await startWsServer();
    const client = new NodeRedWsClient(mockSSE as unknown as SSEHandler, {
      baseURL: `http://localhost:${port}`,
    });

    // Wait for the server to see the connection AND a tick for the 'open' handler to run
    await new Promise<void>(resolve => {
      wss.once('connection', () => setTimeout(resolve, 20));
      client.connect();
    });

    expect(client.isConnected()).toBe(true);
    client.disconnect();
    await close();
  });

  it('broadcasts a status event for status/<nodeId> messages', async () => {
    const { wss, port, close } = await startWsServer();
    const client = new NodeRedWsClient(mockSSE as unknown as SSEHandler, {
      baseURL: `http://localhost:${port}`,
    });

    await new Promise<void>(resolve => {
      wss.once('connection', (ws: WebSocket) => {
        ws.send(
          JSON.stringify({
            topic: 'status/node-abc',
            data: { fill: 'green', shape: 'dot', text: 'ok' },
          })
        );
        resolve();
      });
      client.connect();
    });

    // Wait for message to be processed
    await new Promise(r => setTimeout(r, 50));

    expect(mockSSE.broadcast).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'status',
        data: expect.objectContaining({
          id: 'node-abc',
          status: expect.objectContaining({ fill: 'green', text: 'ok' }),
        }),
      })
    );

    client.disconnect();
    await close();
  });

  it('broadcasts a node event for debug messages', async () => {
    const { wss, port, close } = await startWsServer();
    const client = new NodeRedWsClient(mockSSE as unknown as SSEHandler, {
      baseURL: `http://localhost:${port}`,
    });

    await new Promise<void>(resolve => {
      wss.once('connection', (ws: WebSocket) => {
        ws.send(JSON.stringify({ topic: 'debug', data: { id: 'node-debug', msg: 'hello' } }));
        resolve();
      });
      client.connect();
    });

    await new Promise(r => setTimeout(r, 50));

    expect(mockSSE.broadcast).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'node',
        data: expect.objectContaining({ id: 'node-debug', type: 'debug' }),
      })
    );

    client.disconnect();
    await close();
  });

  it('broadcasts a runtime event for notification/runtime-state', async () => {
    const { wss, port, close } = await startWsServer();
    const client = new NodeRedWsClient(mockSSE as unknown as SSEHandler, {
      baseURL: `http://localhost:${port}`,
    });

    await new Promise<void>(resolve => {
      wss.once('connection', (ws: WebSocket) => {
        ws.send(JSON.stringify({ topic: 'notification/runtime-state', data: { state: 'stop' } }));
        resolve();
      });
      client.connect();
    });

    await new Promise(r => setTimeout(r, 50));

    expect(mockSSE.broadcast).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'runtime',
        data: expect.objectContaining({ event: 'stop' }),
      })
    );

    client.disconnect();
    await close();
  });

  it('broadcasts a node event for notification/node/added', async () => {
    const { wss, port, close } = await startWsServer();
    const client = new NodeRedWsClient(mockSSE as unknown as SSEHandler, {
      baseURL: `http://localhost:${port}`,
    });

    await new Promise<void>(resolve => {
      wss.once('connection', (ws: WebSocket) => {
        ws.send(
          JSON.stringify({ topic: 'notification/node/added', data: { id: 'n1', type: 'inject' } })
        );
        resolve();
      });
      client.connect();
    });

    await new Promise(r => setTimeout(r, 50));

    expect(mockSSE.broadcast).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'node',
        data: expect.objectContaining({ id: 'n1' }),
      })
    );

    client.disconnect();
    await close();
  });

  it('passes resolved auth headers through to the WS handshake', async () => {
    vi.mocked(resolveNodeRedAuthHeader).mockResolvedValue({
      Authorization: 'Bearer some-token',
    });

    const { wss, port, close } = await startWsServer();
    const client = new NodeRedWsClient(mockSSE as unknown as SSEHandler, {
      baseURL: `http://localhost:${port}`,
    });

    let receivedAuthHeader: string | undefined;
    await new Promise<void>(resolve => {
      wss.once('connection', (_ws: WebSocket, req) => {
        receivedAuthHeader = req.headers.authorization;
        setTimeout(resolve, 20);
      });
      client.connect();
    });

    expect(receivedAuthHeader).toBe('Bearer some-token');
    expect(resolveNodeRedAuthHeader).toHaveBeenCalled();

    client.disconnect();
    await close();
  });

  it('disconnect stops reconnect loop', async () => {
    const client = new NodeRedWsClient(mockSSE as unknown as SSEHandler, {
      baseURL: 'http://localhost:9', // nothing listening on port 9
      maxReconnectDelay: 100,
    });

    client.connect();
    await new Promise(r => setTimeout(r, 30));
    client.disconnect();

    const callCountAfterDisconnect = mockSSE.broadcast.mock.calls.length;
    await new Promise(r => setTimeout(r, 200));

    // No new broadcasts after disconnect
    expect(mockSSE.broadcast.mock.calls.length).toBe(callCountAfterDisconnect);
    expect(client.isConnected()).toBe(false);
  });

  it('ignores malformed messages', async () => {
    const { wss, port, close } = await startWsServer();
    const client = new NodeRedWsClient(mockSSE as unknown as SSEHandler, {
      baseURL: `http://localhost:${port}`,
    });

    await new Promise<void>(resolve => {
      wss.once('connection', (ws: WebSocket) => {
        ws.send('not-valid-json');
        resolve();
      });
      client.connect();
    });

    await new Promise(r => setTimeout(r, 50));
    // Should not throw — broadcast may or may not be called for malformed input
    expect(client.isConnected()).toBe(true);

    client.disconnect();
    await close();
  });

  it('sends { auth: token } as the first message when a token is available', async () => {
    vi.mocked(resolveNodeRedAuthToken).mockResolvedValue('some-token');

    const { wss, port, close } = await startWsServer();
    const client = new NodeRedWsClient(mockSSE as unknown as SSEHandler, {
      baseURL: `http://localhost:${port}`,
    });

    let firstMessage: string | undefined;
    await new Promise<void>(resolve => {
      wss.once('connection', (ws: WebSocket) => {
        ws.once('message', raw => {
          // eslint-disable-next-line @typescript-eslint/no-base-to-string
          firstMessage = raw.toString();
          resolve();
        });
      });
      client.connect();
    });

    expect(JSON.parse(firstMessage!)).toEqual({ auth: 'some-token' });

    client.disconnect();
    await close();
  });

  it('sends no auth message when no token is available', async () => {
    const { wss, port, close } = await startWsServer();
    const client = new NodeRedWsClient(mockSSE as unknown as SSEHandler, {
      baseURL: `http://localhost:${port}`,
    });

    let receivedAnyMessage = false;
    await new Promise<void>(resolve => {
      wss.once('connection', (ws: WebSocket) => {
        ws.once('message', () => {
          receivedAnyMessage = true;
        });
        setTimeout(resolve, 50);
      });
      client.connect();
    });

    expect(receivedAnyMessage).toBe(false);

    client.disconnect();
    await close();
  });

  it('handles { auth: "ok" } / { auth: "fail" } handshake replies without broadcasting or throwing', async () => {
    const { wss, port, close } = await startWsServer();
    const client = new NodeRedWsClient(mockSSE as unknown as SSEHandler, {
      baseURL: `http://localhost:${port}`,
    });

    await new Promise<void>(resolve => {
      wss.once('connection', (ws: WebSocket) => {
        ws.send(JSON.stringify({ auth: 'ok' }));
        ws.send(JSON.stringify({ auth: 'fail' }));
        setTimeout(resolve, 30);
      });
      client.connect();
    });

    expect(mockSSE.broadcast).not.toHaveBeenCalled();
    expect(client.isConnected()).toBe(true);

    client.disconnect();
    await close();
  });

  it('ignores a well-formed frame with neither topic nor auth', async () => {
    const { wss, port, close } = await startWsServer();
    const client = new NodeRedWsClient(mockSSE as unknown as SSEHandler, {
      baseURL: `http://localhost:${port}`,
    });

    await new Promise<void>(resolve => {
      wss.once('connection', (ws: WebSocket) => {
        ws.send(JSON.stringify({ unrelated: true }));
        setTimeout(resolve, 30);
      });
      client.connect();
    });

    expect(mockSSE.broadcast).not.toHaveBeenCalled();
    expect(client.isConnected()).toBe(true);

    client.disconnect();
    await close();
  });

  it('handles a batched array of events in a single WS message', async () => {
    const { wss, port, close } = await startWsServer();
    const client = new NodeRedWsClient(mockSSE as unknown as SSEHandler, {
      baseURL: `http://localhost:${port}`,
    });

    await new Promise<void>(resolve => {
      wss.once('connection', (ws: WebSocket) => {
        ws.send(
          JSON.stringify([
            { topic: 'status/node-a', data: { fill: 'green', text: 'ok' } },
            { topic: 'status/node-b', data: { fill: 'red', text: 'bad' } },
          ])
        );
        setTimeout(resolve, 30);
      });
      client.connect();
    });

    expect(mockSSE.broadcast).toHaveBeenCalledTimes(2);

    client.disconnect();
    await close();
  });

  it('forces a token refresh on the next connect attempt after an auth failure', async () => {
    vi.mocked(resolveNodeRedAuthToken).mockResolvedValue('some-token');

    const { wss, port, close } = await startWsServer();
    const client = new NodeRedWsClient(mockSSE as unknown as SSEHandler, {
      baseURL: `http://localhost:${port}`,
      maxReconnectDelay: 50,
    });

    await new Promise<void>(resolve => {
      wss.once('connection', (ws: WebSocket) => {
        ws.send(JSON.stringify({ auth: 'fail' }));
        // Real Node-RED closes the socket on auth failure; do the same here
        // so the client's reconnect path actually runs.
        setTimeout(() => ws.close(), 10);
        resolve();
      });
      client.connect();
    });

    // The first scheduled reconnect always waits 1000ms regardless of
    // maxReconnectDelay (see NodeRedWsClient's reconnectDelay reset) — wait
    // past that for _connect() to run again.
    await new Promise(r => setTimeout(r, 1200));

    const forceRefreshCalls = vi
      .mocked(resolveNodeRedAuthToken)
      .mock.calls.filter(call => call[0] === true);
    expect(forceRefreshCalls.length).toBeGreaterThan(0);

    client.disconnect();
    await close();
  });
});
