/**
 * NodeRedEventListener tests
 * Tests for the Node-RED event listener service
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { NodeRedEventListener } from './nodered-event-listener.js';
import { SSEHandler } from '../server/sse-handler.js';
import { NodeRedAPIClient } from './nodered-api.js';

// Mock SSEHandler
vi.mock('../server/sse-handler.js', () => ({
  SSEHandler: vi.fn().mockImplementation(() => ({
    broadcast: vi.fn(),
  })),
}));

// Mock NodeRedAPIClient
vi.mock('./nodered-api.js', () => ({
  NodeRedAPIClient: vi.fn().mockImplementation(() => ({
    healthCheck: vi.fn().mockResolvedValue({ healthy: true }),
    getFlows: vi.fn().mockResolvedValue([
      { id: 'flow-1', type: 'tab', label: 'Test Flow 1' },
      { id: 'flow-2', type: 'tab', label: 'Test Flow 2' },
    ]),
  })),
}));

describe('NodeRedEventListener', () => {
  let eventListener: NodeRedEventListener;
  let mockSSEHandler: { broadcast: ReturnType<typeof vi.fn> };
  let mockNodeRedClient: {
    healthCheck: ReturnType<typeof vi.fn>;
    getFlows: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});

    mockSSEHandler = {
      broadcast: vi.fn(),
    };

    mockNodeRedClient = {
      healthCheck: vi.fn().mockResolvedValue({ healthy: true }),
      getFlows: vi.fn().mockResolvedValue([
        { id: 'flow-1', type: 'tab', label: 'Test Flow 1' },
        { id: 'flow-2', type: 'tab', label: 'Test Flow 2' },
      ]),
    };

    eventListener = new NodeRedEventListener(
      mockSSEHandler as unknown as SSEHandler,
      mockNodeRedClient as unknown as NodeRedAPIClient
    );
  });

  afterEach(() => {
    eventListener.stopEventMonitoring();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe('constructor', () => {
    it('should create instance with SSEHandler and NodeRedAPIClient', () => {
      expect(eventListener).toBeDefined();
      expect(eventListener).toBeInstanceOf(NodeRedEventListener);
    });

    it('should initialize with monitoring stopped', () => {
      const status = eventListener.getStatus();
      expect(status.isMonitoring).toBe(false);
    });

    it('should initialize lastEventTimestamp', () => {
      const status = eventListener.getStatus();
      expect(status.lastEventTimestamp).toBeDefined();
      expect(typeof status.lastEventTimestamp).toBe('number');
    });
  });

  describe('startEventMonitoring', () => {
    it('should start monitoring with default interval', () => {
      eventListener.startEventMonitoring();

      const status = eventListener.getStatus();
      expect(status.isMonitoring).toBe(true);
    });

    it('should start monitoring with custom interval', () => {
      eventListener.startEventMonitoring(10000);

      const status = eventListener.getStatus();
      expect(status.isMonitoring).toBe(true);
    });

    it('should broadcast runtime start event', () => {
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

    it('should not start monitoring if already started', () => {
      eventListener.startEventMonitoring();
      const firstCallCount = mockSSEHandler.broadcast.mock.calls.length;

      eventListener.startEventMonitoring();
      const secondCallCount = mockSSEHandler.broadcast.mock.calls.length;

      // Should not have additional broadcasts
      expect(secondCallCount).toBe(firstCallCount);
      expect(console.log).toHaveBeenCalledWith(
        'Node-RED event monitoring already started'
      );
    });

    it('should log the interval', () => {
      eventListener.startEventMonitoring(5000);

      expect(console.log).toHaveBeenCalledWith(
        'Starting Node-RED event monitoring (interval: 5000ms)'
      );
    });

    it('should poll for runtime events at specified interval', async () => {
      eventListener.startEventMonitoring(1000);

      // Clear initial broadcast call
      mockSSEHandler.broadcast.mockClear();

      // Advance timer to trigger polling
      await vi.advanceTimersByTimeAsync(1000);

      // Should have called healthCheck
      expect(mockNodeRedClient.healthCheck).toHaveBeenCalled();
    });

    it('should poll for flow events at specified interval', async () => {
      eventListener.startEventMonitoring(1000);

      // Clear initial calls
      mockNodeRedClient.getFlows.mockClear();

      // Advance timer to trigger polling
      await vi.advanceTimersByTimeAsync(1000);

      // Should have called getFlows
      expect(mockNodeRedClient.getFlows).toHaveBeenCalled();
    });
  });

  describe('stopEventMonitoring', () => {
    it('should stop monitoring', () => {
      eventListener.startEventMonitoring();
      eventListener.stopEventMonitoring();

      const status = eventListener.getStatus();
      expect(status.isMonitoring).toBe(false);
    });

    it('should broadcast runtime stop event', () => {
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

    it('should clear polling interval', async () => {
      eventListener.startEventMonitoring(1000);
      eventListener.stopEventMonitoring();

      // Clear previous calls
      mockNodeRedClient.healthCheck.mockClear();
      mockNodeRedClient.getFlows.mockClear();

      // Advance timer
      await vi.advanceTimersByTimeAsync(2000);

      // Should not have called healthCheck or getFlows after stop
      expect(mockNodeRedClient.healthCheck).not.toHaveBeenCalled();
      expect(mockNodeRedClient.getFlows).not.toHaveBeenCalled();
    });

    it('should not broadcast if not monitoring', () => {
      eventListener.stopEventMonitoring();

      expect(mockSSEHandler.broadcast).not.toHaveBeenCalled();
    });

    it('should log when stopping', () => {
      eventListener.startEventMonitoring();
      eventListener.stopEventMonitoring();

      expect(console.log).toHaveBeenCalledWith(
        'Stopping Node-RED event monitoring'
      );
    });
  });

  describe('event polling', () => {
    it('should broadcast runtime status when healthy', async () => {
      mockNodeRedClient.healthCheck.mockResolvedValue({ healthy: true });

      eventListener.startEventMonitoring(1000);
      mockSSEHandler.broadcast.mockClear();

      await vi.advanceTimersByTimeAsync(1000);

      expect(mockSSEHandler.broadcast).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'runtime',
          data: expect.objectContaining({
            event: 'start',
            message: 'Node-RED is running',
          }),
        })
      );
    });

    it('should broadcast error status when unhealthy', async () => {
      mockNodeRedClient.healthCheck.mockResolvedValue({ healthy: false });

      eventListener.startEventMonitoring(1000);
      mockSSEHandler.broadcast.mockClear();

      await vi.advanceTimersByTimeAsync(1000);

      expect(mockSSEHandler.broadcast).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'runtime',
          data: expect.objectContaining({
            event: 'error',
            message: 'Node-RED connection error',
          }),
        })
      );
    });

    it('should broadcast error when healthCheck fails', async () => {
      mockNodeRedClient.healthCheck.mockRejectedValue(
        new Error('Connection refused')
      );

      eventListener.startEventMonitoring(1000);
      mockSSEHandler.broadcast.mockClear();

      await vi.advanceTimersByTimeAsync(1000);

      expect(mockSSEHandler.broadcast).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'error',
          data: expect.objectContaining({
            error: 'Runtime health check failed',
          }),
        })
      );
    });

    it('should broadcast flow event after time threshold', async () => {
      // Set last event timestamp to be old
      const listener = eventListener as any;
      listener.lastEventTimestamp = Date.now() - 120000; // 2 minutes ago

      eventListener.startEventMonitoring(1000);
      mockSSEHandler.broadcast.mockClear();

      await vi.advanceTimersByTimeAsync(1000);

      expect(mockSSEHandler.broadcast).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'flow',
          data: expect.objectContaining({
            id: 'global',
            event: 'start',
            message: '2 flows are active',
          }),
        })
      );
    });

    it('should not broadcast flow event within time threshold', async () => {
      eventListener.startEventMonitoring(1000);

      // Clear initial broadcast
      mockSSEHandler.broadcast.mockClear();

      await vi.advanceTimersByTimeAsync(1000);

      // Should have runtime broadcast but no flow broadcast (within 1 minute)
      const flowBroadcasts = mockSSEHandler.broadcast.mock.calls.filter(
        (call) => call[0].type === 'flow'
      );

      expect(flowBroadcasts.length).toBe(0);
    });

    it('should broadcast flow error when getFlows fails', async () => {
      mockNodeRedClient.getFlows.mockRejectedValue(
        new Error('Network error')
      );

      // Set last event timestamp to be old to trigger flow check
      const listener = eventListener as any;
      listener.lastEventTimestamp = Date.now() - 120000;

      eventListener.startEventMonitoring(1000);
      mockSSEHandler.broadcast.mockClear();

      await vi.advanceTimersByTimeAsync(1000);

      expect(mockSSEHandler.broadcast).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'flow',
          data: expect.objectContaining({
            id: 'global',
            event: 'error',
            message: 'Failed to get flow status',
          }),
        })
      );
    });

    it('should handle polling errors gracefully', async () => {
      mockNodeRedClient.healthCheck.mockRejectedValue(
        new Error('API error')
      );
      mockNodeRedClient.getFlows.mockRejectedValue(
        new Error('API error')
      );

      eventListener.startEventMonitoring(1000);

      // Should not throw
      await vi.advanceTimersByTimeAsync(1000);

      expect(console.error).toHaveBeenCalled();
    });

    it('should broadcast error with details when polling fails', async () => {
      const testError = new Error('Test polling error');
      mockNodeRedClient.healthCheck.mockRejectedValue(testError);

      eventListener.startEventMonitoring(1000);
      mockSSEHandler.broadcast.mockClear();

      await vi.advanceTimersByTimeAsync(1000);

      // Should have broadcast an error event
      expect(mockSSEHandler.broadcast).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'error',
        })
      );
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
        expect.objectContaining({
          timestamp: expect.any(String),
        })
      );
    });
  });

  describe('onNodeStatus', () => {
    it('should broadcast node status event', () => {
      eventListener.onNodeStatus('node-123', {
        fill: 'green',
        shape: 'dot',
        text: 'Connected',
      });

      expect(mockSSEHandler.broadcast).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'status',
          data: expect.objectContaining({
            id: 'node-123',
            status: expect.objectContaining({
              fill: 'green',
              shape: 'dot',
              text: 'Connected',
            }),
          }),
        })
      );
    });

    it('should broadcast status with partial fields', () => {
      eventListener.onNodeStatus('node-456', {
        fill: 'red',
      });

      expect(mockSSEHandler.broadcast).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'status',
          data: expect.objectContaining({
            id: 'node-456',
            status: expect.objectContaining({
              fill: 'red',
            }),
          }),
        })
      );
    });

    it('should handle empty status object', () => {
      eventListener.onNodeStatus('node-789', {});

      expect(mockSSEHandler.broadcast).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'status',
          data: expect.objectContaining({
            id: 'node-789',
          }),
        })
      );
    });

    it('should include timestamp in event', () => {
      eventListener.onNodeStatus('node-123', { text: 'Test' });

      expect(mockSSEHandler.broadcast).toHaveBeenCalledWith(
        expect.objectContaining({
          timestamp: expect.any(String),
        })
      );
    });
  });

  describe('getStatus', () => {
    it('should return isMonitoring false when not started', () => {
      const status = eventListener.getStatus();
      expect(status.isMonitoring).toBe(false);
    });

    it('should return isMonitoring true when started', () => {
      eventListener.startEventMonitoring();

      const status = eventListener.getStatus();
      expect(status.isMonitoring).toBe(true);
    });

    it('should return isMonitoring false after stop', () => {
      eventListener.startEventMonitoring();
      eventListener.stopEventMonitoring();

      const status = eventListener.getStatus();
      expect(status.isMonitoring).toBe(false);
    });

    it('should return lastEventTimestamp', () => {
      const status = eventListener.getStatus();
      expect(status.lastEventTimestamp).toBeDefined();
      expect(typeof status.lastEventTimestamp).toBe('number');
      expect(status.lastEventTimestamp).toBeLessThanOrEqual(Date.now());
    });

    it('should update lastEventTimestamp after flow event', async () => {
      // Set last event timestamp to be old
      const listener = eventListener as any;
      listener.lastEventTimestamp = Date.now() - 120000;

      const initialTimestamp = listener.lastEventTimestamp;

      eventListener.startEventMonitoring(1000);
      await vi.advanceTimersByTimeAsync(1000);

      const status = eventListener.getStatus();
      expect(status.lastEventTimestamp).toBeGreaterThan(initialTimestamp);
    });
  });

  describe('memory reporting', () => {
    it('should include memory usage in runtime events', async () => {
      eventListener.startEventMonitoring(1000);

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

  describe('error handling', () => {
    it('should handle non-Error objects in polling', async () => {
      mockNodeRedClient.healthCheck.mockRejectedValue('string error');

      eventListener.startEventMonitoring(1000);
      mockSSEHandler.broadcast.mockClear();

      await vi.advanceTimersByTimeAsync(1000);

      // Should not throw and should broadcast error
      expect(mockSSEHandler.broadcast).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'error',
        })
      );
    });

    it('should log errors to console', async () => {
      mockNodeRedClient.healthCheck.mockRejectedValue(
        new Error('Test error')
      );

      eventListener.startEventMonitoring(1000);
      await vi.advanceTimersByTimeAsync(1000);

      expect(console.error).toHaveBeenCalled();
    });
  });
});
