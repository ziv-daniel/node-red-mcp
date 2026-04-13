/**
 * SSE Integration Tests
 * Tests for SSE connection lifecycle and event flow with NodeRedEventListener
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'events';

import { SSEHandler } from '../../src/server/sse-handler.js';
import { NodeRedEventListener } from '../../src/services/nodered-event-listener.js';

// Mock NodeRedAPIClient
const mockNodeRedClient = {
  healthCheck: vi.fn().mockResolvedValue({ healthy: true }),
  getFlows: vi.fn().mockResolvedValue([{ id: 'flow-1', label: 'Test Flow', type: 'tab' }]),
};

vi.mock('../../src/services/nodered-api.js', () => ({
  NodeRedAPIClient: vi.fn().mockImplementation(() => mockNodeRedClient),
}));

// Helper to create mock request
function createMockRequest(overrides: Record<string, any> = {}): any {
  const emitter = new EventEmitter();
  return {
    get: vi.fn((header: string) => (header === 'User-Agent' ? 'Test-Agent/1.0' : undefined)),
    ip: '127.0.0.1',
    auth: { userId: 'test-user' },
    on: emitter.on.bind(emitter),
    emit: emitter.emit.bind(emitter),
    connection: {
      remoteAddress: '127.0.0.1',
    },
    ...overrides,
  };
}

// Helper to create mock response
function createMockResponse(): any {
  const emitter = new EventEmitter();
  return {
    writeHead: vi.fn(),
    write: vi.fn().mockReturnValue(true),
    end: vi.fn(),
    on: emitter.on.bind(emitter),
    emit: emitter.emit.bind(emitter),
    flushHeaders: vi.fn(),
    headersSent: false,
    destroyed: false,
  };
}

describe('SSE Integration', () => {
  let sseHandler: SSEHandler;

  beforeEach(() => {
    vi.useFakeTimers();
    // Suppress console output during tests
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    sseHandler = new SSEHandler({
      heartbeatInterval: 30000, // Use longer interval to avoid interference
      maxConnections: 10,
    });
  });

  afterEach(() => {
    sseHandler.destroy();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe('Connection Lifecycle', () => {
    it('should establish new connection and return connection ID', () => {
      const req = createMockRequest();
      const res = createMockResponse();

      const connectionId = sseHandler.connect(req, res);

      expect(connectionId).toBeDefined();
      expect(typeof connectionId).toBe('string');
      expect(sseHandler.getStats().activeConnections).toBe(1);
    });

    it('should send SSE headers on connect', () => {
      const req = createMockRequest();
      const res = createMockResponse();

      sseHandler.connect(req, res);

      expect(res.writeHead).toHaveBeenCalledWith(
        200,
        expect.objectContaining({
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
        })
      );
    });

    it('should handle client disconnect via close event', () => {
      const req = createMockRequest();
      const res = createMockResponse();

      sseHandler.connect(req, res);
      expect(sseHandler.getStats().activeConnections).toBe(1);

      // Simulate close
      req.emit('close');

      expect(sseHandler.getStats().activeConnections).toBe(0);
    });

    it('should clean up resources on explicit disconnect', () => {
      const req = createMockRequest();
      const res = createMockResponse();

      const connectionId = sseHandler.connect(req, res);

      sseHandler.disconnect(connectionId);

      expect(sseHandler.getStats().activeConnections).toBe(0);
    });

    it('should increment total connections count', () => {
      const req1 = createMockRequest({ ip: '192.168.1.1' });
      const res1 = createMockResponse();
      const req2 = createMockRequest({ ip: '192.168.1.2' });
      const res2 = createMockResponse();

      sseHandler.connect(req1, res1);
      sseHandler.connect(req2, res2);

      const stats = sseHandler.getStats();
      expect(stats.totalConnections).toBe(2);
      expect(stats.activeConnections).toBe(2);
    });
  });

  describe('Event Broadcasting', () => {
    it('should broadcast events to subscribed connections', () => {
      const req = createMockRequest();
      const res = createMockResponse();

      const connectionId = sseHandler.connect(req, res);
      sseHandler.subscribe(connectionId, ['flow-events']);

      // Clear initial writes
      res.write.mockClear();

      // Broadcast to flow-events subscribers
      sseHandler.broadcast({ type: 'flow-events', timestamp: new Date().toISOString(), data: {} });

      expect(res.write).toHaveBeenCalled();
    });

    it('should not send to unsubscribed connections', () => {
      const req1 = createMockRequest({ ip: '192.168.1.1' });
      const res1 = createMockResponse();
      const req2 = createMockRequest({ ip: '192.168.1.2' });
      const res2 = createMockResponse();

      const connId1 = sseHandler.connect(req1, res1);
      // Second connection intentionally not subscribed
      sseHandler.connect(req2, res2);

      // Only subscribe first connection
      sseHandler.subscribe(connId1, ['special']);

      // Clear writes
      res1.write.mockClear();
      res2.write.mockClear();

      // Broadcast
      sseHandler.broadcast({ type: 'special', timestamp: new Date().toISOString(), data: {} });

      expect(res1.write).toHaveBeenCalled();
      expect(res2.write).not.toHaveBeenCalled();
    });

    it('should return count of messages sent', () => {
      // Create 3 connections all subscribed to same topic
      for (let i = 0; i < 3; i++) {
        const req = createMockRequest({ ip: `192.168.1.${i}` });
        const res = createMockResponse();
        const connId = sseHandler.connect(req, res);
        sseHandler.subscribe(connId, ['test-topic']);
      }

      const sentCount = sseHandler.broadcast({
        type: 'test-topic',
        timestamp: new Date().toISOString(),
        data: {},
      });

      expect(sentCount).toBe(3);
    });
  });

  describe('Subscription Management', () => {
    it('should manage subscriptions correctly', () => {
      const req = createMockRequest();
      const res = createMockResponse();

      const connectionId = sseHandler.connect(req, res);
      sseHandler.subscribe(connectionId, ['topic1', 'topic2']);

      const subs = sseHandler.getSubscriptions(connectionId);
      expect(subs.eventTypes).toContain('topic1');
      expect(subs.eventTypes).toContain('topic2');
    });

    it('should unsubscribe from topics', () => {
      const req = createMockRequest();
      const res = createMockResponse();

      const connectionId = sseHandler.connect(req, res);
      sseHandler.subscribe(connectionId, ['topic1', 'topic2', 'topic3']);
      sseHandler.unsubscribe(connectionId, ['topic2']);

      const subs = sseHandler.getSubscriptions(connectionId);
      expect(subs.eventTypes).toContain('topic1');
      expect(subs.eventTypes).not.toContain('topic2');
      expect(subs.eventTypes).toContain('topic3');
    });

    it('should throw error for invalid connection ID on subscribe', () => {
      expect(() => {
        sseHandler.subscribe('invalid-id', ['topic']);
      }).toThrow();
    });
  });

  describe('NodeRedEventListener Integration', () => {
    it('should broadcast flow deploy events from listener', () => {
      const eventListener = new NodeRedEventListener(sseHandler, mockNodeRedClient as any);

      const req = createMockRequest();
      const res = createMockResponse();
      const connId = sseHandler.connect(req, res);

      // Subscribe to all events
      sseHandler.subscribe(connId, ['*']);

      // Clear initial writes
      res.write.mockClear();

      // Trigger flow deploy event
      eventListener.onFlowDeploy('test-flow-123');

      expect(res.write).toHaveBeenCalled();
    });

    it('should broadcast node status events from listener', () => {
      const eventListener = new NodeRedEventListener(sseHandler, mockNodeRedClient as any);

      const req = createMockRequest();
      const res = createMockResponse();
      const connId = sseHandler.connect(req, res);
      sseHandler.subscribe(connId, ['*']);

      res.write.mockClear();

      eventListener.onNodeStatus('node-1', {
        fill: 'green',
        shape: 'dot',
        text: 'connected',
      });

      expect(res.write).toHaveBeenCalled();
    });

    it('should broadcast monitoring start event', () => {
      const eventListener = new NodeRedEventListener(sseHandler, mockNodeRedClient as any);

      const req = createMockRequest();
      const res = createMockResponse();
      const connId = sseHandler.connect(req, res);
      sseHandler.subscribe(connId, ['*']);

      res.write.mockClear();

      eventListener.startEventMonitoring(5000);

      expect(res.write).toHaveBeenCalled();

      // Clean up
      eventListener.stopEventMonitoring();
    });

    it('should broadcast monitoring stop event', () => {
      const eventListener = new NodeRedEventListener(sseHandler, mockNodeRedClient as any);

      const req = createMockRequest();
      const res = createMockResponse();
      const connId = sseHandler.connect(req, res);
      sseHandler.subscribe(connId, ['*']);

      eventListener.startEventMonitoring(5000);
      res.write.mockClear();

      eventListener.stopEventMonitoring();

      expect(res.write).toHaveBeenCalled();
    });
  });

  describe('Statistics Tracking', () => {
    it('should track message count', () => {
      const req = createMockRequest();
      const res = createMockResponse();
      const connId = sseHandler.connect(req, res);
      sseHandler.subscribe(connId, ['test']);

      const initialStats = sseHandler.getStats();
      const initialMessages = initialStats.messagesSent;

      // Send some broadcasts
      for (let i = 0; i < 3; i++) {
        sseHandler.broadcast({
          type: 'test',
          timestamp: new Date().toISOString(),
          data: { count: i },
        });
      }

      const finalStats = sseHandler.getStats();
      expect(finalStats.messagesSent).toBeGreaterThan(initialMessages);
    });

    it('should report uptime', () => {
      const stats = sseHandler.getStats();
      expect(stats.uptime).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Client Information', () => {
    it('should return list of connected clients', () => {
      const req1 = createMockRequest({ ip: '192.168.1.1' });
      const res1 = createMockResponse();
      const req2 = createMockRequest({ ip: '192.168.1.2' });
      const res2 = createMockResponse();

      sseHandler.connect(req1, res1);
      sseHandler.connect(req2, res2);

      const clients = sseHandler.getClients();
      expect(clients.length).toBe(2);
      expect(clients[0]).toHaveProperty('connectionId');
      expect(clients[0]).toHaveProperty('userId');
    });

    it('should include subscription info in client list', () => {
      const req = createMockRequest();
      const res = createMockResponse();

      const connId = sseHandler.connect(req, res);
      sseHandler.subscribe(connId, ['topic1', 'topic2']);

      const clients = sseHandler.getClients();
      const client = clients.find(c => c.connectionId === connId);

      expect(client).toBeDefined();
      expect(client?.subscriptions).toContain('topic1');
      expect(client?.subscriptions).toContain('topic2');
    });
  });

  describe('Resource Cleanup', () => {
    it('should clean up all connections on destroy', () => {
      // Create multiple connections
      for (let i = 0; i < 3; i++) {
        const req = createMockRequest({ ip: `192.168.1.${i}` });
        const res = createMockResponse();
        sseHandler.connect(req, res);
      }

      expect(sseHandler.getStats().activeConnections).toBe(3);

      sseHandler.destroy();

      expect(sseHandler.getStats().activeConnections).toBe(0);
    });

    it('should clear all connections via clearAllConnections', () => {
      for (let i = 0; i < 3; i++) {
        const req = createMockRequest({ ip: `192.168.1.${i}` });
        const res = createMockResponse();
        sseHandler.connect(req, res);
      }

      sseHandler.clearAllConnections();

      expect(sseHandler.getStats().activeConnections).toBe(0);
    });

    it('should handle forceDisconnect', () => {
      const req = createMockRequest();
      const res = createMockResponse();

      const connId = sseHandler.connect(req, res);
      expect(sseHandler.getStats().activeConnections).toBe(1);

      const result = sseHandler.forceDisconnect(connId);

      expect(result).toBe(true);
      expect(sseHandler.getStats().activeConnections).toBe(0);
    });

    it('should return false for forceDisconnect with invalid ID', () => {
      const result = sseHandler.forceDisconnect('invalid-id');
      expect(result).toBe(false);
    });
  });
});
