/**
 * NodeRedEventListener tests
 * Tests for the Node-RED event listener service (WebSocket-based)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { SSEHandler } from '../server/sse-handler.js';

import { NodeRedAPIClient } from './nodered-api.js';
import { NodeRedEventListener } from './nodered-event-listener.js';
import { NodeRedWsClient } from './nodered-ws-client.js';

vi.mock('../server/sse-handler.js', () => ({
  SSEHandler: vi.fn().mockImplementation(() => ({ broadcast: vi.fn() })),
}));

vi.mock('./nodered-api.js', () => ({
  NodeRedAPIClient: vi.fn().mockImplementation(() => ({})),
}));

vi.mock('./nodered-ws-client.js', () => ({
  NodeRedWsClient: vi.fn(),
}));

function makeMockWsClient() {
  return {
    connect: vi.fn(),
    disconnect: vi.fn(),
    isConnected: vi.fn().mockReturnValue(false),
  };
}

describe('NodeRedEventListener', () => {
  let eventListener: NodeRedEventListener;
  let mockSSEHandler: { broadcast: ReturnType<typeof vi.fn> };
  let mockNodeRedClient: object;
  let mockWsClient: ReturnType<typeof makeMockWsClient>;

  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});

    mockSSEHandler = { broadcast: vi.fn() };
    mockNodeRedClient = {};
    mockWsClient = makeMockWsClient();

    eventListener = new NodeRedEventListener(
      mockSSEHandler as unknown as SSEHandler,
      mockNodeRedClient as unknown as NodeRedAPIClient,
      mockWsClient as unknown as NodeRedWsClient
    );
  });

  afterEach(() => {
    eventListener.stopEventMonitoring();
    vi.restoreAllMocks();
  });

  describe('constructor', () => {
    it('should create instance', () => {
      expect(eventListener).toBeInstanceOf(NodeRedEventListener);
    });

    it('should initialise with monitoring stopped', () => {
      expect(eventListener.getStatus().isMonitoring).toBe(false);
    });

    it('should initialise lastEventTimestamp', () => {
      const { lastEventTimestamp } = eventListener.getStatus();
      expect(typeof lastEventTimestamp).toBe('number');
      expect(lastEventTimestamp).toBeLessThanOrEqual(Date.now());
    });
  });

  describe('startEventMonitoring', () => {
    it('should set isMonitoring to true', () => {
      eventListener.startEventMonitoring();
      expect(eventListener.getStatus().isMonitoring).toBe(true);
    });

    it('should broadcast a runtime start event', () => {
      eventListener.startEventMonitoring();
      expect(mockSSEHandler.broadcast).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'runtime',
          data: expect.objectContaining({
            event: 'start',
            message: 'Node-RED event monitoring started',
          }),
        })
      );
    });

    it('should not start again if already monitoring', () => {
      eventListener.startEventMonitoring();
      const callCount = mockSSEHandler.broadcast.mock.calls.length;
      eventListener.startEventMonitoring();
      expect(mockSSEHandler.broadcast.mock.calls.length).toBe(callCount);
      expect(console.log).toHaveBeenCalledWith('Node-RED event monitoring already started');
    });
  });

  describe('stopEventMonitoring', () => {
    it('should set isMonitoring to false', () => {
      eventListener.startEventMonitoring();
      eventListener.stopEventMonitoring();
      expect(eventListener.getStatus().isMonitoring).toBe(false);
    });

    it('should broadcast a runtime stop event', () => {
      eventListener.startEventMonitoring();
      mockSSEHandler.broadcast.mockClear();
      eventListener.stopEventMonitoring();
      expect(mockSSEHandler.broadcast).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'runtime',
          data: expect.objectContaining({
            event: 'stop',
            message: 'Node-RED event monitoring stopped',
          }),
        })
      );
    });

    it('should be a no-op if not monitoring', () => {
      eventListener.stopEventMonitoring();
      expect(mockSSEHandler.broadcast).not.toHaveBeenCalled();
    });

    it('should log when stopping', () => {
      eventListener.startEventMonitoring();
      eventListener.stopEventMonitoring();
      expect(console.log).toHaveBeenCalledWith('Stopping Node-RED event monitoring');
    });
  });

  describe('onFlowDeploy', () => {
    it('should broadcast flow deploy event with flowId', () => {
      eventListener.onFlowDeploy('flow-123');
      expect(mockSSEHandler.broadcast).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'flow',
          data: expect.objectContaining({
            id: 'flow-123',
            event: 'deploy',
            message: 'Flow flow-123 deployed',
          }),
        })
      );
    });

    it('should broadcast global deploy event without flowId', () => {
      eventListener.onFlowDeploy();
      expect(mockSSEHandler.broadcast).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'flow',
          data: expect.objectContaining({
            id: 'global',
            event: 'deploy',
            message: 'All flows deployed',
          }),
        })
      );
    });

    it('should include timestamp in event', () => {
      eventListener.onFlowDeploy('flow-1');
      expect(mockSSEHandler.broadcast).toHaveBeenCalledWith(
        expect.objectContaining({ timestamp: expect.any(String) })
      );
    });
  });

  describe('onNodeStatus', () => {
    it('should broadcast node status event', () => {
      eventListener.onNodeStatus('node-123', { fill: 'green', shape: 'dot', text: 'Connected' });
      expect(mockSSEHandler.broadcast).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'status',
          data: expect.objectContaining({
            id: 'node-123',
            status: expect.objectContaining({ fill: 'green', shape: 'dot', text: 'Connected' }),
          }),
        })
      );
    });

    it('should broadcast status with partial fields', () => {
      eventListener.onNodeStatus('node-456', { fill: 'red' });
      expect(mockSSEHandler.broadcast).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'status',
          data: expect.objectContaining({ id: 'node-456' }),
        })
      );
    });

    it('should handle empty status object', () => {
      eventListener.onNodeStatus('node-789', {});
      expect(mockSSEHandler.broadcast).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'status',
          data: expect.objectContaining({ id: 'node-789' }),
        })
      );
    });

    it('should include timestamp in event', () => {
      eventListener.onNodeStatus('node-123', { text: 'Test' });
      expect(mockSSEHandler.broadcast).toHaveBeenCalledWith(
        expect.objectContaining({ timestamp: expect.any(String) })
      );
    });
  });

  describe('getStatus', () => {
    it('should return isMonitoring false when not started', () => {
      expect(eventListener.getStatus().isMonitoring).toBe(false);
    });

    it('should return isMonitoring true when started', () => {
      eventListener.startEventMonitoring();
      expect(eventListener.getStatus().isMonitoring).toBe(true);
    });

    it('should return isMonitoring false after stop', () => {
      eventListener.startEventMonitoring();
      eventListener.stopEventMonitoring();
      expect(eventListener.getStatus().isMonitoring).toBe(false);
    });

    it('should return a numeric lastEventTimestamp', () => {
      const { lastEventTimestamp } = eventListener.getStatus();
      expect(typeof lastEventTimestamp).toBe('number');
    });
  });

  describe('memory reporting', () => {
    it('should include memory usage in runtime start event', () => {
      eventListener.startEventMonitoring();
      expect(mockSSEHandler.broadcast).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'runtime',
          data: expect.objectContaining({
            memory: expect.objectContaining({
              rss: expect.any(Number),
              heapTotal: expect.any(Number),
              heapUsed: expect.any(Number),
            }),
          }),
        })
      );
    });
  });
});
