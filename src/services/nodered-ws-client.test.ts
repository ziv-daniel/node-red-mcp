/**
 * NodeRedWsClient unit tests — uses a real in-process WS server via the 'ws' library.
 */

import { createServer } from 'http';

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { WebSocketServer, WebSocket } from 'ws';

import { SSEHandler } from '../server/sse-handler.js';
import { validateNodeRedAuth } from '../utils/auth.js';

import { NodeRedWsClient } from './nodered-ws-client.js';

// Silence auth util so we control the token
vi.mock('../utils/auth.js', () => ({
  validateNodeRedAuth: vi.fn().mockReturnValue({ type: 'none' }),
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
    vi.mocked(validateNodeRedAuth).mockReturnValue({ type: 'none' });
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

  it('sends auth token on connect when bearer token is set', async () => {
    const { validateNodeRedAuth } = await import('../utils/auth.js');
    vi.mocked(validateNodeRedAuth).mockReturnValue({
      type: 'bearer',
      credentials: { token: 'my-token' },
    });

    const { wss, port, close } = await startWsServer();
    const client = new NodeRedWsClient(mockSSE as unknown as SSEHandler, {
      baseURL: `http://localhost:${port}`,
    });

    const receivedMessages: string[] = [];
    await new Promise<void>(resolve => {
      wss.once('connection', (ws: WebSocket) => {
        ws.on('message', (msg: WebSocket.RawData) => {
          // eslint-disable-next-line @typescript-eslint/no-base-to-string
          receivedMessages.push(msg.toString());
          resolve();
        });
      });
      client.connect();
    });

    await new Promise(r => setTimeout(r, 50));

    expect(receivedMessages).toContain(JSON.stringify({ auth: 'my-token' }));

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
});
