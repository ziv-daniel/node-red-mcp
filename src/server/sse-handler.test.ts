/**
 * SSE Handler tests
 * Tests for Server-Sent Events connection management
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'events';
import type { Response } from 'express';

import { SSEHandler } from './sse-handler.js';
import type { AuthRequest } from '../utils/auth.js';
import type { SSEEvent, SSEEventFilter } from '../types/sse.js';

// Mock uuid
vi.mock('uuid', () => ({
  v4: vi.fn(() => `mock-uuid-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`),
}));

// Helper to create mock request
function createMockRequest(overrides: Partial<AuthRequest> = {}): AuthRequest {
  const emitter = new EventEmitter();
  return {
    get: vi.fn((header: string) => {
      if (header === 'User-Agent') return 'Test-Agent/1.0';
      return undefined;
    }),
    ip: '127.0.0.1',
    connection: { remoteAddress: '127.0.0.1' },
    auth: { userId: 'test-user' },
    on: emitter.on.bind(emitter),
    emit: emitter.emit.bind(emitter),
    ...overrides,
  } as unknown as AuthRequest;
}

// Helper to create mock response
function createMockResponse(): Response & {
  _headers: Record<string, string>;
  _data: string[];
  _statusCode: number;
  destroyed: boolean;
} {
  const res = {
    _headers: {} as Record<string, string>,
    _data: [] as string[],
    _statusCode: 200,
    destroyed: false,
    writeHead: vi.fn(function (this: any, status: number, headers: Record<string, string>) {
      this._statusCode = status;
      this._headers = { ...this._headers, ...headers };
      return this;
    }),
    write: vi.fn(function (this: any, data: string) {
      this._data.push(data);
      return true;
    }),
    end: vi.fn(function (this: any) {
      this.destroyed = true;
      return this;
    }),
    status: vi.fn(function (this: any, code: number) {
      this._statusCode = code;
      return this;
    }),
    json: vi.fn(function (this: any, data: unknown) {
      this._data.push(JSON.stringify(data));
      return this;
    }),
    on: vi.fn(),
  };

  return res as unknown as Response & {
    _headers: Record<string, string>;
    _data: string[];
    _statusCode: number;
    destroyed: boolean;
  };
}

describe('SSEHandler', () => {
  let handler: SSEHandler;

  beforeEach(() => {
    vi.useFakeTimers();
    handler = new SSEHandler({
      heartbeatInterval: 30000,
      maxConnections: 10,
      retryTimeout: 5000,
    });
  });

  afterEach(() => {
    handler.destroy();
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  describe('Constructor', () => {
    it('should create handler with default config', () => {
      const defaultHandler = new SSEHandler();
      const stats = defaultHandler.getStats();

      expect(stats.totalConnections).toBe(0);
      expect(stats.activeConnections).toBe(0);
      defaultHandler.destroy();
    });

    it('should create handler with custom config', () => {
      const customHandler = new SSEHandler({
        maxConnections: 50,
        heartbeatInterval: 60000,
      });

      expect(customHandler).toBeInstanceOf(SSEHandler);
      customHandler.destroy();
    });

    it('should initialize stats correctly', () => {
      const stats = handler.getStats();

      expect(stats.totalConnections).toBe(0);
      expect(stats.activeConnections).toBe(0);
      expect(stats.messagesSent).toBe(0);
      expect(stats.errors).toBe(0);
      expect(typeof stats.uptime).toBe('number');
    });

    it('should start heartbeat automatically', () => {
      // Heartbeat should be running
      vi.advanceTimersByTime(30000);
      // No error means heartbeat is working
      expect(handler.getStats().activeConnections).toBe(0);
    });
  });

  describe('connect', () => {
    it('should establish SSE connection', () => {
      const req = createMockRequest();
      const res = createMockResponse();

      const connectionId = handler.connect(req, res);

      expect(connectionId).toBeDefined();
      expect(typeof connectionId).toBe('string');
      expect(handler.getStats().activeConnections).toBe(1);
    });

    it('should set correct SSE headers', () => {
      const req = createMockRequest();
      const res = createMockResponse();

      handler.connect(req, res);

      expect(res.writeHead).toHaveBeenCalledWith(
        200,
        expect.objectContaining({
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
        })
      );
    });

    it('should send initial connection event', () => {
      const req = createMockRequest();
      const res = createMockResponse();

      const connectionId = handler.connect(req, res);

      expect(res._data.length).toBeGreaterThan(0);
      const sentData = res._data.join('');
      expect(sentData).toContain('connection-status');
      expect(sentData).toContain(connectionId);
    });

    it('should track client info', () => {
      const req = createMockRequest();
      const res = createMockResponse();

      handler.connect(req, res);

      const clients = handler.getClients();
      expect(clients.length).toBe(1);
      expect(clients[0]?.userId).toBe('test-user');
      expect(clients[0]?.isAlive).toBe(true);
    });

    it('should increment connection stats', () => {
      const req = createMockRequest();
      const res = createMockResponse();

      handler.connect(req, res);

      const stats = handler.getStats();
      expect(stats.totalConnections).toBe(1);
      expect(stats.activeConnections).toBe(1);
    });

    it('should reject when max connections reached', () => {
      // Create max connections
      for (let i = 0; i < 10; i++) {
        const req = createMockRequest();
        const res = createMockResponse();
        handler.connect(req, res);
      }

      // Try to connect one more
      const req = createMockRequest();
      const res = createMockResponse();

      expect(() => handler.connect(req, res)).toThrow('Maximum connections reached');
      expect(res._statusCode).toBe(429);
    });

    it('should handle missing user agent', () => {
      const req = createMockRequest({
        get: vi.fn(() => undefined),
      });
      const res = createMockResponse();

      const connectionId = handler.connect(req, res);

      expect(connectionId).toBeDefined();
    });

    it('should handle missing IP', () => {
      const req = createMockRequest({
        ip: undefined,
        connection: { remoteAddress: undefined },
      } as any);
      const res = createMockResponse();

      const connectionId = handler.connect(req, res);

      expect(connectionId).toBeDefined();
    });

    it('should handle missing auth', () => {
      const req = createMockRequest({
        auth: undefined,
      } as any);
      const res = createMockResponse();

      const connectionId = handler.connect(req, res);

      expect(connectionId).toBeDefined();
      const clients = handler.getClients();
      expect(clients[0]?.userId).toBeUndefined();
    });
  });

  describe('disconnect', () => {
    it('should disconnect connection', () => {
      const req = createMockRequest();
      const res = createMockResponse();

      const connectionId = handler.connect(req, res);
      handler.disconnect(connectionId);

      expect(handler.getStats().activeConnections).toBe(0);
      expect(res.end).toHaveBeenCalled();
    });

    it('should handle non-existent connection', () => {
      // Should not throw
      handler.disconnect('non-existent-id');
      expect(handler.getStats().activeConnections).toBe(0);
    });

    it('should decrement active connections stat', () => {
      const req1 = createMockRequest();
      const res1 = createMockResponse();
      const req2 = createMockRequest();
      const res2 = createMockResponse();

      const id1 = handler.connect(req1, res1);
      handler.connect(req2, res2);

      expect(handler.getStats().activeConnections).toBe(2);

      handler.disconnect(id1);
      expect(handler.getStats().activeConnections).toBe(1);
    });

    it('should not go below zero active connections', () => {
      handler.disconnect('fake-id');
      handler.disconnect('another-fake-id');

      expect(handler.getStats().activeConnections).toBe(0);
    });

    it('should handle already destroyed response', () => {
      const req = createMockRequest();
      const res = createMockResponse();
      res.destroyed = true;

      const connectionId = handler.connect(req, res);
      handler.disconnect(connectionId);

      // end() should not be called again
      expect(res.end).not.toHaveBeenCalled();
    });
  });

  describe('subscribe', () => {
    it('should subscribe connection to event types', () => {
      const req = createMockRequest();
      const res = createMockResponse();

      const connectionId = handler.connect(req, res);
      handler.subscribe(connectionId, ['flow-change', 'node-status']);

      const subs = handler.getSubscriptions(connectionId);
      expect(subs.eventTypes).toContain('flow-change');
      expect(subs.eventTypes).toContain('node-status');
    });

    it('should throw for non-existent connection', () => {
      expect(() => handler.subscribe('fake-id', ['event'])).toThrow('Connection fake-id not found');
    });

    it('should update connection stats by event type', () => {
      const req = createMockRequest();
      const res = createMockResponse();

      const connectionId = handler.connect(req, res);
      handler.subscribe(connectionId, ['flow-change']);

      const stats = handler.getStats();
      expect(stats.connectionsByEventType['flow-change']).toBe(1);
    });

    it('should allow multiple subscriptions', () => {
      const req = createMockRequest();
      const res = createMockResponse();

      const connectionId = handler.connect(req, res);
      handler.subscribe(connectionId, ['event1']);
      handler.subscribe(connectionId, ['event2', 'event3']);

      const subs = handler.getSubscriptions(connectionId);
      expect(subs.eventTypes.length).toBe(3);
    });
  });

  describe('subscribeWithFilter', () => {
    it('should subscribe with filter', () => {
      const req = createMockRequest();
      const res = createMockResponse();

      const connectionId = handler.connect(req, res);
      const filter: SSEEventFilter = {
        flowIds: ['flow-1', 'flow-2'],
        nodeIds: ['node-1'],
      };

      handler.subscribeWithFilter(connectionId, 'flow-change', filter);

      const subs = handler.getSubscriptions(connectionId);
      expect(subs.eventTypes).toContain('flow-change');
      expect(subs.filters['flow-change']).toEqual(filter);
    });

    it('should throw for non-existent connection', () => {
      expect(() => handler.subscribeWithFilter('fake-id', 'event')).toThrow(
        'Connection fake-id not found'
      );
    });

    it('should work without filter', () => {
      const req = createMockRequest();
      const res = createMockResponse();

      const connectionId = handler.connect(req, res);
      handler.subscribeWithFilter(connectionId, 'flow-change');

      const subs = handler.getSubscriptions(connectionId);
      expect(subs.eventTypes).toContain('flow-change');
      expect(subs.filters['flow-change']).toBeUndefined();
    });
  });

  describe('getSubscriptions', () => {
    it('should return subscriptions for connection', () => {
      const req = createMockRequest();
      const res = createMockResponse();

      const connectionId = handler.connect(req, res);
      handler.subscribe(connectionId, ['event1', 'event2']);

      const subs = handler.getSubscriptions(connectionId);
      expect(subs.eventTypes).toEqual(expect.arrayContaining(['event1', 'event2']));
      expect(subs.filters).toEqual({});
    });

    it('should throw for non-existent connection', () => {
      expect(() => handler.getSubscriptions('fake-id')).toThrow('Connection fake-id not found');
    });

    it('should return filters when set', () => {
      const req = createMockRequest();
      const res = createMockResponse();

      const connectionId = handler.connect(req, res);
      const filter: SSEEventFilter = { flowIds: ['flow-1'] };
      handler.subscribeWithFilter(connectionId, 'event', filter);

      const subs = handler.getSubscriptions(connectionId);
      expect(subs.filters['event']).toEqual(filter);
    });
  });

  describe('unsubscribe', () => {
    it('should unsubscribe from event types', () => {
      const req = createMockRequest();
      const res = createMockResponse();

      const connectionId = handler.connect(req, res);
      handler.subscribe(connectionId, ['event1', 'event2', 'event3']);
      handler.unsubscribe(connectionId, ['event1', 'event2']);

      const subs = handler.getSubscriptions(connectionId);
      expect(subs.eventTypes).not.toContain('event1');
      expect(subs.eventTypes).not.toContain('event2');
      expect(subs.eventTypes).toContain('event3');
    });

    it('should handle non-existent connection silently', () => {
      // Should not throw
      handler.unsubscribe('fake-id', ['event']);
    });

    it('should update stats when unsubscribing', () => {
      const req = createMockRequest();
      const res = createMockResponse();

      const connectionId = handler.connect(req, res);
      handler.subscribe(connectionId, ['event1']);
      handler.unsubscribe(connectionId, ['event1']);

      const stats = handler.getStats();
      expect(stats.connectionsByEventType['event1']).toBeUndefined();
    });
  });

  describe('sendToConnection', () => {
    it('should send event to connection', () => {
      const req = createMockRequest();
      const res = createMockResponse();

      const connectionId = handler.connect(req, res);
      res._data = []; // Clear initial connection event

      const event = {
        type: 'runtime',
        timestamp: new Date().toISOString(),
        data: { event: 'start', message: 'test' },
      } as SSEEvent;

      const result = handler.sendToConnection(connectionId, event);

      expect(result).toBe(true);
      expect(res._data.length).toBeGreaterThan(0);
      expect(res._data.join('')).toContain('runtime');
    });

    it('should return false for non-existent connection', () => {
      const event = {
        type: 'status',
        timestamp: new Date().toISOString(),
      } as SSEEvent;

      const result = handler.sendToConnection('fake-id', event);

      expect(result).toBe(false);
    });

    it('should return false for dead connection', () => {
      const req = createMockRequest();
      const res = createMockResponse();

      const connectionId = handler.connect(req, res);

      // Make connection inactive for a long time
      vi.advanceTimersByTime(100000);
      handler.checkConnectionHealth();

      const event = {
        type: 'status',
        timestamp: new Date().toISOString(),
      } as SSEEvent;

      // Connection should be disconnected
      const result = handler.sendToConnection(connectionId, event);
      expect(result).toBe(false);
    });

    it('should increment messagesSent stat', () => {
      const req = createMockRequest();
      const res = createMockResponse();

      const connectionId = handler.connect(req, res);
      const initialSent = handler.getStats().messagesSent;

      const event = {
        type: 'status',
        timestamp: new Date().toISOString(),
      } as SSEEvent;

      handler.sendToConnection(connectionId, event);

      expect(handler.getStats().messagesSent).toBe(initialSent + 1);
    });

    it('should handle write errors', () => {
      const req = createMockRequest();
      const res = createMockResponse();
      res.write = vi.fn(() => {
        throw new Error('Write failed');
      });

      const connectionId = handler.connect(req, res);
      res._data = [];

      const event = {
        type: 'status',
        timestamp: new Date().toISOString(),
      } as SSEEvent;

      const result = handler.sendToConnection(connectionId, event);

      expect(result).toBe(false);
      expect(handler.getStats().errors).toBeGreaterThan(0);
    });
  });

  describe('broadcast', () => {
    it('should broadcast to subscribed connections', () => {
      const req1 = createMockRequest();
      const res1 = createMockResponse();
      const req2 = createMockRequest();
      const res2 = createMockResponse();

      const id1 = handler.connect(req1, res1);
      const id2 = handler.connect(req2, res2);

      handler.subscribe(id1, ['flow']);
      handler.subscribe(id2, ['flow']);

      res1._data = [];
      res2._data = [];

      const event = {
        type: 'flow',
        timestamp: new Date().toISOString(),
        data: { id: 'test', event: 'deploy', message: 'hello' },
      } as SSEEvent;

      const count = handler.broadcast(event);

      expect(count).toBe(2);
      expect(res1._data.length).toBeGreaterThan(0);
      expect(res2._data.length).toBeGreaterThan(0);
    });

    it('should not broadcast to unsubscribed connections', () => {
      const req1 = createMockRequest();
      const res1 = createMockResponse();
      const req2 = createMockRequest();
      const res2 = createMockResponse();

      const id1 = handler.connect(req1, res1);
      handler.connect(req2, res2);

      handler.subscribe(id1, ['runtime']);

      res1._data = [];
      res2._data = [];

      const event = {
        type: 'runtime',
        timestamp: new Date().toISOString(),
      } as SSEEvent;

      const count = handler.broadcast(event);

      expect(count).toBe(1);
      expect(res1._data.length).toBeGreaterThan(0);
      expect(res2._data.length).toBe(0);
    });

    it('should broadcast to wildcard subscribers', () => {
      const req = createMockRequest();
      const res = createMockResponse();

      const connectionId = handler.connect(req, res);
      handler.subscribe(connectionId, ['*']);

      res._data = [];

      const event = {
        type: 'status',
        timestamp: new Date().toISOString(),
      } as SSEEvent;

      const count = handler.broadcast(event);

      expect(count).toBe(1);
      expect(res._data.length).toBeGreaterThan(0);
    });

    it('should apply global filter', () => {
      const req = createMockRequest({ auth: { userId: 'user-1', permissions: [], isAuthenticated: true } });
      const res = createMockResponse();

      const connectionId = handler.connect(req, res);
      handler.subscribe(connectionId, ['status']);

      res._data = [];

      const event = {
        type: 'status',
        timestamp: new Date().toISOString(),
      } as SSEEvent;

      // Filter for different user
      const filter: SSEEventFilter = { userId: 'user-2' };
      const count = handler.broadcast(event, filter);

      expect(count).toBe(0);
      expect(res._data.length).toBe(0);
    });

    it('should apply connection-specific filter', () => {
      const req = createMockRequest();
      const res = createMockResponse();

      const connectionId = handler.connect(req, res);
      const filter: SSEEventFilter = { flowIds: ['flow-1'] };
      handler.subscribeWithFilter(connectionId, 'flow', filter);

      res._data = [];

      // Event for different flow
      const event = {
        type: 'flow',
        timestamp: new Date().toISOString(),
        data: { id: 'flow-2', flowId: 'flow-2', event: 'deploy', message: 'deployed' },
      } as SSEEvent;

      const count = handler.broadcast(event);

      expect(count).toBe(0);
    });

    it('should return zero for no connections', () => {
      const event = {
        type: 'status',
        timestamp: new Date().toISOString(),
      } as SSEEvent;

      const count = handler.broadcast(event);

      expect(count).toBe(0);
    });
  });

  describe('sendHeartbeat', () => {
    it('should send heartbeat to subscribed connections', () => {
      const req = createMockRequest();
      const res = createMockResponse();

      const connectionId = handler.connect(req, res);
      handler.subscribe(connectionId, ['heartbeat']);

      res._data = [];
      handler.sendHeartbeat();

      expect(res._data.length).toBeGreaterThan(0);
      expect(res._data.join('')).toContain('heartbeat');
    });

    it('should send heartbeat to wildcard subscribers', () => {
      const req = createMockRequest();
      const res = createMockResponse();

      const connectionId = handler.connect(req, res);
      handler.subscribe(connectionId, ['*']);

      res._data = [];
      handler.sendHeartbeat();

      expect(res._data.length).toBeGreaterThan(0);
    });

    it('should not send to non-heartbeat subscribers', () => {
      const req = createMockRequest();
      const res = createMockResponse();

      const connectionId = handler.connect(req, res);
      handler.subscribe(connectionId, ['flow-change']);

      res._data = [];
      handler.sendHeartbeat();

      expect(res._data.length).toBe(0);
    });
  });

  describe('checkConnectionHealth', () => {
    it('should clean up dead connections', () => {
      const req = createMockRequest();
      const res = createMockResponse();

      handler.connect(req, res);
      expect(handler.getStats().activeConnections).toBe(1);

      // Advance time past timeout (3x heartbeat interval)
      vi.advanceTimersByTime(100000);

      handler.checkConnectionHealth();

      expect(handler.getStats().activeConnections).toBe(0);
    });

    it('should keep active connections', () => {
      const req = createMockRequest();
      const res = createMockResponse();

      const connectionId = handler.connect(req, res);

      // Keep connection active by sending event
      vi.advanceTimersByTime(20000);
      handler.sendToConnection(connectionId, {
        type: 'heartbeat',
        timestamp: new Date().toISOString(),
      } as SSEEvent);

      handler.checkConnectionHealth();

      expect(handler.getStats().activeConnections).toBe(1);
    });
  });

  describe('sendSystemInfo', () => {
    it('should broadcast system info', () => {
      const req = createMockRequest();
      const res = createMockResponse();

      const connectionId = handler.connect(req, res);
      handler.subscribe(connectionId, ['system-info']);

      res._data = [];

      handler.sendSystemInfo({
        nodeRedStatus: 'connected',
        activeFlows: 5,
        totalNodes: 25,
      });

      expect(res._data.length).toBeGreaterThan(0);
      expect(res._data.join('')).toContain('system-info');
    });
  });

  describe('sendError', () => {
    it('should send error to specific connection', () => {
      const req = createMockRequest();
      const res = createMockResponse();

      const connectionId = handler.connect(req, res);
      res._data = [];

      handler.sendError('Test error', connectionId, 'test-source');

      expect(res._data.length).toBeGreaterThan(0);
      expect(res._data.join('')).toContain('error');
    });

    it('should broadcast error when no connection specified', () => {
      const req = createMockRequest();
      const res = createMockResponse();

      const connectionId = handler.connect(req, res);
      handler.subscribe(connectionId, ['error']);
      res._data = [];

      handler.sendError('Broadcast error');

      expect(res._data.length).toBeGreaterThan(0);
    });

    it('should increment error stat', () => {
      const initialErrors = handler.getStats().errors;

      handler.sendError('Test error');

      expect(handler.getStats().errors).toBe(initialErrors + 1);
    });
  });

  describe('getStats', () => {
    it('should return current statistics', () => {
      const stats = handler.getStats();

      expect(stats).toHaveProperty('totalConnections');
      expect(stats).toHaveProperty('activeConnections');
      expect(stats).toHaveProperty('messagesSent');
      expect(stats).toHaveProperty('errors');
      expect(stats).toHaveProperty('uptime');
      expect(stats).toHaveProperty('connectionsByEventType');
    });

    it('should track total connections', () => {
      const req1 = createMockRequest();
      const res1 = createMockResponse();
      const req2 = createMockRequest();
      const res2 = createMockResponse();

      const id1 = handler.connect(req1, res1);
      handler.connect(req2, res2);
      handler.disconnect(id1);

      const stats = handler.getStats();
      expect(stats.totalConnections).toBe(2);
      expect(stats.activeConnections).toBe(1);
    });

    it('should calculate uptime correctly', () => {
      vi.advanceTimersByTime(5000);

      const stats = handler.getStats();
      expect(stats.uptime).toBeGreaterThanOrEqual(5000);
    });
  });

  describe('getClients', () => {
    it('should return list of connected clients', () => {
      const req = createMockRequest();
      const res = createMockResponse();

      const connectionId = handler.connect(req, res);
      handler.subscribe(connectionId, ['event1', 'event2']);

      const clients = handler.getClients();

      expect(clients.length).toBe(1);
      expect(clients[0]?.connectionId).toBe(connectionId);
      expect(clients[0]?.userId).toBe('test-user');
      expect(clients[0]?.subscriptions).toContain('event1');
      expect(clients[0]?.subscriptions).toContain('event2');
      expect(clients[0]?.isAlive).toBe(true);
    });

    it('should return empty array when no clients', () => {
      const clients = handler.getClients();
      expect(clients).toEqual([]);
    });
  });

  describe('forceDisconnect', () => {
    it('should force disconnect a connection', () => {
      const req = createMockRequest();
      const res = createMockResponse();

      const connectionId = handler.connect(req, res);
      const result = handler.forceDisconnect(connectionId);

      expect(result).toBe(true);
      expect(handler.getStats().activeConnections).toBe(0);
    });

    it('should return false for non-existent connection', () => {
      const result = handler.forceDisconnect('fake-id');
      expect(result).toBe(false);
    });
  });

  describe('clearAllConnections', () => {
    it('should disconnect all connections', () => {
      const req1 = createMockRequest();
      const res1 = createMockResponse();
      const req2 = createMockRequest();
      const res2 = createMockResponse();

      handler.connect(req1, res1);
      handler.connect(req2, res2);

      expect(handler.getStats().activeConnections).toBe(2);

      handler.clearAllConnections();

      expect(handler.getStats().activeConnections).toBe(0);
      expect(res1.end).toHaveBeenCalled();
      expect(res2.end).toHaveBeenCalled();
    });
  });

  describe('stopHeartbeat', () => {
    it('should stop heartbeat timer', () => {
      handler.stopHeartbeat();

      // Advance time and verify no errors
      vi.advanceTimersByTime(60000);
      expect(handler.getStats().activeConnections).toBe(0);
    });
  });

  describe('destroy', () => {
    it('should clean up all resources', () => {
      const req = createMockRequest();
      const res = createMockResponse();

      handler.connect(req, res);
      handler.destroy();

      expect(handler.getStats().activeConnections).toBe(0);
    });

    it('should stop heartbeat', () => {
      handler.destroy();

      // Should not throw
      vi.advanceTimersByTime(60000);
    });
  });

  describe('Filter matching', () => {
    it('should filter by userId', () => {
      const req = createMockRequest({ auth: { userId: 'user-1', permissions: ['*'], isAuthenticated: true } });
      const res = createMockResponse();

      const connectionId = handler.connect(req, res);
      handler.subscribe(connectionId, ['status']);
      res._data = [];

      const event: SSEEvent = {
        type: 'status',
        timestamp: new Date().toISOString(),
        data: { id: 'node-1', status: { fill: 'green', text: 'ok' } },
      };

      // Filter for same user
      const count1 = handler.broadcast(event, { userId: 'user-1' });
      expect(count1).toBe(1);

      res._data = [];

      // Filter for different user
      const count2 = handler.broadcast(event, { userId: 'user-2' });
      expect(count2).toBe(0);
    });

    it('should filter by eventTypes', () => {
      const req = createMockRequest();
      const res = createMockResponse();

      const connectionId = handler.connect(req, res);
      handler.subscribe(connectionId, ['*']); // Subscribe to all
      res._data = [];

      const event = {
        type: 'flow',
        timestamp: new Date().toISOString(),
        data: { id: 'flow-1', event: 'deploy', message: 'deployed' },
      } as SSEEvent;

      // Filter includes the event type
      const count1 = handler.broadcast(event, { eventTypes: ['flow', 'other'] });
      expect(count1).toBe(1);

      res._data = [];

      // Filter excludes the event type
      const count2 = handler.broadcast(event, { eventTypes: ['other-event'] });
      expect(count2).toBe(0);
    });

    it('should filter by nodeIds', () => {
      const req = createMockRequest();
      const res = createMockResponse();

      const connectionId = handler.connect(req, res);
      handler.subscribe(connectionId, ['status']);
      res._data = [];

      const event = {
        type: 'status',
        timestamp: new Date().toISOString(),
        data: { id: 'node-123', status: { fill: 'green', text: 'ok' } },
      } as SSEEvent;

      // Filter includes the node ID
      const count1 = handler.broadcast(event, { nodeIds: ['node-123', 'node-456'] });
      expect(count1).toBe(1);

      res._data = [];

      // Filter excludes the node ID
      const count2 = handler.broadcast(event, { nodeIds: ['node-789'] });
      expect(count2).toBe(0);
    });

    it('should filter by flowIds', () => {
      const req = createMockRequest();
      const res = createMockResponse();

      const connectionId = handler.connect(req, res);
      handler.subscribe(connectionId, ['flow']);
      res._data = [];

      const event = {
        type: 'flow',
        timestamp: new Date().toISOString(),
        data: { id: 'flow-123', flowId: 'flow-123', event: 'deploy', message: 'deployed' },
      } as SSEEvent;

      // Filter includes the flow ID
      const count1 = handler.broadcast(event, { flowIds: ['flow-123'] });
      expect(count1).toBe(1);

      res._data = [];

      // Filter excludes the flow ID
      const count2 = handler.broadcast(event, { flowIds: ['flow-789'] });
      expect(count2).toBe(0);
    });
  });

  describe('SSE Message formatting', () => {
    it('should format message with all fields', () => {
      const req = createMockRequest();
      const res = createMockResponse();

      const connectionId = handler.connect(req, res);
      res._data = [];

      const event = {
        type: 'runtime',
        timestamp: new Date().toISOString(),
        data: { event: 'start', message: 'test' },
      } as SSEEvent;

      handler.sendToConnection(connectionId, event);

      const message = res._data.join('');
      expect(message).toContain('id:');
      expect(message).toContain('event: runtime');
      expect(message).toContain('retry: 5000');
      expect(message).toContain('data:');
    });
  });
});
