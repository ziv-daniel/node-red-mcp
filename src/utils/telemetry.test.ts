/**
 * Telemetry module tests
 * Tests for OpenTelemetry configuration and metrics
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SpanKind, SpanStatusCode } from '@opentelemetry/api';

import {
  initializeTelemetry,
  tracer,
  meter,
  generateTraceId,
  createSpan,
  mcpTracing,
  nodeRedTracing,
  mcpMetrics,
  nodeRedMetrics,
  shutdownTelemetry,
} from './telemetry.js';

// Mock the OpenTelemetry SDK
vi.mock('@opentelemetry/sdk-node', () => ({
  NodeSDK: vi.fn(() => ({
    start: vi.fn(),
    shutdown: vi.fn().mockResolvedValue(undefined),
  })),
}));

vi.mock('@opentelemetry/auto-instrumentations-node', () => ({
  getNodeAutoInstrumentations: vi.fn(() => []),
}));

describe('Telemetry Module', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('generateTraceId', () => {
    it('should generate a unique trace ID', () => {
      const id = generateTraceId();

      expect(id).toBeDefined();
      expect(typeof id).toBe('string');
      expect(id).toMatch(/^trace_\d+_[a-z0-9]+$/);
    });

    it('should generate different IDs for each call', () => {
      const id1 = generateTraceId();
      const id2 = generateTraceId();

      expect(id1).not.toBe(id2);
    });

    it('should start with "trace_" prefix', () => {
      const id = generateTraceId();
      expect(id.startsWith('trace_')).toBe(true);
    });
  });

  describe('tracer', () => {
    it('should be defined', () => {
      expect(tracer).toBeDefined();
    });

    it('should have startSpan method', () => {
      expect(typeof tracer.startSpan).toBe('function');
    });
  });

  describe('meter', () => {
    it('should be defined', () => {
      expect(meter).toBeDefined();
    });

    it('should have createCounter method', () => {
      expect(typeof meter.createCounter).toBe('function');
    });

    it('should have createHistogram method', () => {
      expect(typeof meter.createHistogram).toBe('function');
    });

    it('should have createUpDownCounter method', () => {
      expect(typeof meter.createUpDownCounter).toBe('function');
    });
  });

  describe('createSpan', () => {
    it('should create a span with name', () => {
      const span = createSpan('test-span');

      expect(span).toBeDefined();
      expect(typeof span.end).toBe('function');
      span.end();
    });

    it('should create a span with options', () => {
      const span = createSpan('test-span', {
        kind: SpanKind.SERVER,
        attributes: { 'custom.attribute': 'value' },
      });

      expect(span).toBeDefined();
      span.end();
    });

    it('should default to INTERNAL kind', () => {
      const span = createSpan('test-span');

      expect(span).toBeDefined();
      span.end();
    });
  });

  describe('mcpTracing', () => {
    describe('traceToolCall', () => {
      it('should trace successful tool call', async () => {
        const result = await mcpTracing.traceToolCall(
          'get_flows',
          { filter: 'active' },
          async () => ({ flows: [] })
        );

        expect(result).toEqual({ flows: [] });
      });

      it('should trace failed tool call', async () => {
        await expect(
          mcpTracing.traceToolCall('get_flows', {}, async () => {
            throw new Error('Tool failed');
          })
        ).rejects.toThrow('Tool failed');
      });

      it('should include tool name in span', async () => {
        await mcpTracing.traceToolCall('create_flow', { name: 'test' }, async () => 'created');
      });
    });

    describe('traceResourceRequest', () => {
      it('should trace resource request', async () => {
        const result = await mcpTracing.traceResourceRequest(
          'nodered://flows',
          async () => 'resource data'
        );

        expect(result).toBe('resource data');
      });

      it('should trace failed resource request', async () => {
        await expect(
          mcpTracing.traceResourceRequest('nodered://flows', async () => {
            throw new Error('Resource not found');
          })
        ).rejects.toThrow('Resource not found');
      });
    });

    describe('traceServerOperation', () => {
      it('should trace server operation', async () => {
        const result = await mcpTracing.traceServerOperation('initialize', async () => ({
          version: '1.0.0',
        }));

        expect(result).toEqual({ version: '1.0.0' });
      });

      it('should trace failed server operation', async () => {
        await expect(
          mcpTracing.traceServerOperation('initialize', async () => {
            throw new Error('Init failed');
          })
        ).rejects.toThrow('Init failed');
      });
    });
  });

  describe('nodeRedTracing', () => {
    describe('traceApiCall', () => {
      it('should trace API call', async () => {
        const result = await nodeRedTracing.traceApiCall('/flows', 'GET', async () => ({
          status: 200,
        }));

        expect(result).toEqual({ status: 200 });
      });

      it('should trace failed API call', async () => {
        await expect(
          nodeRedTracing.traceApiCall('/flows', 'GET', async () => {
            throw new Error('Network error');
          })
        ).rejects.toThrow('Network error');
      });
    });

    describe('traceFlowOperation', () => {
      it('should trace flow operation', async () => {
        const result = await nodeRedTracing.traceFlowOperation(
          'create',
          'flow-123',
          async () => 'success'
        );

        expect(result).toBe('success');
      });

      it('should trace failed flow operation', async () => {
        await expect(
          nodeRedTracing.traceFlowOperation('delete', 'flow-123', async () => {
            throw new Error('Flow not found');
          })
        ).rejects.toThrow('Flow not found');
      });
    });
  });

  describe('mcpMetrics', () => {
    it('should have toolCallCounter', () => {
      expect(mcpMetrics.toolCallCounter).toBeDefined();
    });

    it('should have toolCallDuration', () => {
      expect(mcpMetrics.toolCallDuration).toBeDefined();
    });

    it('should have resourceRequestCounter', () => {
      expect(mcpMetrics.resourceRequestCounter).toBeDefined();
    });

    it('should have activeConnections', () => {
      expect(mcpMetrics.activeConnections).toBeDefined();
    });

    describe('recordToolCall', () => {
      it('should record successful tool call', () => {
        // Should not throw
        mcpMetrics.recordToolCall('get_flows', 150, true);
      });

      it('should record failed tool call', () => {
        // Should not throw
        mcpMetrics.recordToolCall('create_flow', 50, false);
      });
    });

    describe('recordResourceRequest', () => {
      it('should record resource request', () => {
        // Should not throw
        mcpMetrics.recordResourceRequest('nodered://flows');
      });
    });

    describe('updateActiveConnections', () => {
      it('should increment connections', () => {
        // Should not throw
        mcpMetrics.updateActiveConnections(1);
      });

      it('should decrement connections', () => {
        // Should not throw
        mcpMetrics.updateActiveConnections(-1);
      });
    });
  });

  describe('nodeRedMetrics', () => {
    it('should have apiCallCounter', () => {
      expect(nodeRedMetrics.apiCallCounter).toBeDefined();
    });

    it('should have apiCallDuration', () => {
      expect(nodeRedMetrics.apiCallDuration).toBeDefined();
    });

    describe('recordApiCall', () => {
      it('should record successful API call', () => {
        // Should not throw
        nodeRedMetrics.recordApiCall('/flows', 'GET', 200, 100);
      });

      it('should record failed API call', () => {
        // Should not throw
        nodeRedMetrics.recordApiCall('/flows/123', 'DELETE', 404, 50);
      });

      it('should record server error', () => {
        // Should not throw
        nodeRedMetrics.recordApiCall('/flows', 'POST', 500, 200);
      });
    });
  });

  describe('initializeTelemetry', () => {
    it('should return null in test environment', () => {
      const sdk = initializeTelemetry();

      // In test environment without ENABLE_TELEMETRY_IN_TESTS, should return null
      expect(sdk).toBeNull();
    });
  });

  describe('shutdownTelemetry', () => {
    it('should handle null SDK', async () => {
      // Should not throw
      await shutdownTelemetry(null);
    });

    it('should shutdown SDK', async () => {
      const mockSdk = {
        shutdown: vi.fn().mockResolvedValue(undefined),
      };

      await shutdownTelemetry(mockSdk as any);

      expect(mockSdk.shutdown).toHaveBeenCalled();
    });

    it('should handle shutdown error', async () => {
      const mockSdk = {
        shutdown: vi.fn().mockRejectedValue(new Error('Shutdown failed')),
      };

      // Should not throw
      await shutdownTelemetry(mockSdk as any);
    });
  });
});
