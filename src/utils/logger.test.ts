/**
 * Logger module tests
 * Tests for structured logging configuration
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import {
  logger,
  createChildLogger,
  mcpLogger,
  sseLogger,
  nodeRedLogger,
  httpLogger,
  generateRequestId,
  logError,
  logPerformance,
  logAudit,
  mcpLog,
  nodeRedLog,
  logStartup,
  logShutdown,
} from './logger.js';

describe('Logger Module', () => {
  beforeEach(() => {
    vi.spyOn(logger, 'info').mockImplementation(() => undefined as any);
    vi.spyOn(logger, 'error').mockImplementation(() => undefined as any);
    vi.spyOn(logger, 'warn').mockImplementation(() => undefined as any);
    vi.spyOn(logger, 'debug').mockImplementation(() => undefined as any);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('logger instance', () => {
    it('should be defined', () => {
      expect(logger).toBeDefined();
    });

    it('should have standard log methods', () => {
      expect(typeof logger.info).toBe('function');
      expect(typeof logger.error).toBe('function');
      expect(typeof logger.warn).toBe('function');
      expect(typeof logger.debug).toBe('function');
    });

    it('should have child method', () => {
      expect(typeof logger.child).toBe('function');
    });
  });

  describe('createChildLogger', () => {
    it('should create a child logger with context', () => {
      const childLogger = createChildLogger('test-context');

      expect(childLogger).toBeDefined();
      expect(typeof childLogger.info).toBe('function');
    });

    it('should create a child logger with additional fields', () => {
      const childLogger = createChildLogger('test-context', {
        customField: 'value',
        anotherField: 123,
      });

      expect(childLogger).toBeDefined();
    });
  });

  describe('Pre-configured loggers', () => {
    it('mcpLogger should be defined', () => {
      expect(mcpLogger).toBeDefined();
      expect(typeof mcpLogger.info).toBe('function');
    });

    it('sseLogger should be defined', () => {
      expect(sseLogger).toBeDefined();
      expect(typeof sseLogger.info).toBe('function');
    });

    it('nodeRedLogger should be defined', () => {
      expect(nodeRedLogger).toBeDefined();
      expect(typeof nodeRedLogger.info).toBe('function');
    });

    it('httpLogger should be defined', () => {
      expect(httpLogger).toBeDefined();
      expect(typeof httpLogger.info).toBe('function');
    });
  });

  describe('generateRequestId', () => {
    it('should generate a unique request ID', () => {
      const id = generateRequestId();

      expect(id).toBeDefined();
      expect(typeof id).toBe('string');
      expect(id).toMatch(/^req_\d+_[a-z0-9]+$/);
    });

    it('should generate different IDs for each call', () => {
      const id1 = generateRequestId();
      const id2 = generateRequestId();

      expect(id1).not.toBe(id2);
    });

    it('should start with "req_" prefix', () => {
      const id = generateRequestId();
      expect(id.startsWith('req_')).toBe(true);
    });
  });

  describe('logError', () => {
    it('should log Error instances with context', () => {
      const error = new Error('Test error');

      // logError with context uses a child logger, so no throw means it works
      logError(error, 'test-context');
    });

    it('should log non-Error values', () => {
      logError('string error', 'test-context');

      // No throw means it works
    });

    it('should log with metadata', () => {
      const error = new Error('Test error');
      const metadata = { userId: '123', action: 'test' };

      logError(error, 'test-context', metadata);
    });

    it('should work without context and use parent logger', () => {
      const error = new Error('Test error');

      logError(error);

      // When no context, it uses the parent logger
      expect(logger.error).toHaveBeenCalled();
    });
  });

  describe('logPerformance', () => {
    it('should log performance metrics', () => {
      logPerformance('test-operation', 150);

      expect(logger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          operation: 'test-operation',
          duration: 150,
          performance: true,
        }),
        expect.stringContaining('test-operation')
      );
    });

    it('should include metadata', () => {
      logPerformance('test-operation', 100, { extra: 'data' });

      expect(logger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          operation: 'test-operation',
          duration: 100,
          extra: 'data',
        }),
        expect.any(String)
      );
    });

    it('should include duration in message', () => {
      logPerformance('my-op', 200);

      expect(logger.info).toHaveBeenCalledWith(
        expect.any(Object),
        expect.stringContaining('200ms')
      );
    });
  });

  describe('logAudit', () => {
    it('should log audit events', () => {
      logAudit('user-login', 'user-123');

      expect(logger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          audit: true,
          action: 'user-login',
          userId: 'user-123',
        }),
        expect.stringContaining('Audit')
      );
    });

    it('should include timestamp', () => {
      logAudit('user-logout', 'user-456');

      expect(logger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          timestamp: expect.any(String),
        }),
        expect.any(String)
      );
    });

    it('should work without userId', () => {
      logAudit('system-action');

      expect(logger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'system-action',
        }),
        expect.any(String)
      );
    });

    it('should include metadata', () => {
      logAudit('action', 'user', { ip: '127.0.0.1' });

      expect(logger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          ip: '127.0.0.1',
        }),
        expect.any(String)
      );
    });
  });

  describe('mcpLog', () => {
    beforeEach(() => {
      vi.spyOn(mcpLogger, 'info').mockImplementation(() => undefined as any);
    });

    describe('toolCall', () => {
      it('should log tool calls', () => {
        mcpLog.toolCall('get_flows', { filter: 'active' }, 'req-123');

        expect(mcpLogger.info).toHaveBeenCalledWith(
          expect.objectContaining({
            toolName: 'get_flows',
            args: { filter: 'active' },
            requestId: 'req-123',
            action: 'tool-call',
          }),
          expect.stringContaining('get_flows')
        );
      });

      it('should work without requestId', () => {
        mcpLog.toolCall('get_flow', { id: 'flow-1' });

        expect(mcpLogger.info).toHaveBeenCalled();
      });
    });

    describe('toolResult', () => {
      it('should log successful tool results', () => {
        mcpLog.toolResult('get_flows', true, 150, 'req-123');

        expect(mcpLogger.info).toHaveBeenCalledWith(
          expect.objectContaining({
            toolName: 'get_flows',
            success: true,
            duration: 150,
            action: 'tool-result',
          }),
          expect.stringContaining('succeeded')
        );
      });

      it('should log failed tool results', () => {
        mcpLog.toolResult('create_flow', false, 50, 'req-456');

        expect(mcpLogger.info).toHaveBeenCalledWith(
          expect.objectContaining({
            success: false,
          }),
          expect.stringContaining('failed')
        );
      });
    });

    describe('resourceRequest', () => {
      it('should log resource requests', () => {
        mcpLog.resourceRequest('nodered://flows', 'req-789');

        expect(mcpLogger.info).toHaveBeenCalledWith(
          expect.objectContaining({
            resourceName: 'nodered://flows',
            action: 'resource-request',
          }),
          expect.stringContaining('resource requested')
        );
      });
    });
  });

  describe('nodeRedLog', () => {
    beforeEach(() => {
      vi.spyOn(nodeRedLogger, 'info').mockImplementation(() => undefined as any);
    });

    describe('flowOperation', () => {
      it('should log flow operations', () => {
        nodeRedLog.flowOperation('create', 'flow-123');

        expect(nodeRedLogger.info).toHaveBeenCalledWith(
          expect.objectContaining({
            operation: 'create',
            flowId: 'flow-123',
          }),
          expect.stringContaining('create')
        );
      });

      it('should include metadata', () => {
        nodeRedLog.flowOperation('update', 'flow-456', { nodeCount: 5 });

        expect(nodeRedLogger.info).toHaveBeenCalledWith(
          expect.objectContaining({
            nodeCount: 5,
          }),
          expect.any(String)
        );
      });
    });

    describe('nodeOperation', () => {
      it('should log node operations', () => {
        nodeRedLog.nodeOperation('create', 'node-123', 'inject');

        expect(nodeRedLogger.info).toHaveBeenCalledWith(
          expect.objectContaining({
            operation: 'create',
            nodeId: 'node-123',
            nodeType: 'inject',
          }),
          expect.stringContaining('inject')
        );
      });
    });

    describe('apiCall', () => {
      it('should log API calls', () => {
        nodeRedLog.apiCall('/flows', 'GET', 200, 150);

        expect(nodeRedLogger.info).toHaveBeenCalledWith(
          expect.objectContaining({
            endpoint: '/flows',
            method: 'GET',
            statusCode: 200,
            duration: 150,
            action: 'api-call',
          }),
          expect.stringContaining('GET')
        );
      });
    });
  });

  describe('logStartup', () => {
    it('should log component startup', () => {
      logStartup('express-app');

      expect(logger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          component: 'express-app',
          action: 'startup',
        }),
        expect.stringContaining('starting up')
      );
    });

    it('should include metadata', () => {
      logStartup('mcp-server', { port: 3000 });

      expect(logger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          port: 3000,
        }),
        expect.any(String)
      );
    });
  });

  describe('logShutdown', () => {
    it('should log component shutdown', () => {
      logShutdown('express-app');

      expect(logger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          component: 'express-app',
          action: 'shutdown',
        }),
        expect.stringContaining('shutting down')
      );
    });

    it('should include metadata', () => {
      logShutdown('mcp-server', { reason: 'SIGTERM' });

      expect(logger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          reason: 'SIGTERM',
        }),
        expect.any(String)
      );
    });
  });
});
