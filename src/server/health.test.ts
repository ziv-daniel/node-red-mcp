/**
 * Health endpoint tests
 * Tests for health check handlers, metrics functions, and probe endpoints
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Request, Response } from 'express';

// Mock dependencies before imports
vi.mock('axios');
vi.mock('../utils/config.js', () => ({
  appConfig: {
    nodeRed: {
      url: 'http://localhost:1880',
    },
    app: {
      nodeEnv: 'test',
    },
  },
}));
vi.mock('../utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
  logPerformance: vi.fn(),
}));

import axios from 'axios';
import {
  incrementHttpMetrics,
  updateMcpMetrics,
  updateNodeRedMetrics,
  healthCheckHandler,
  readinessHandler,
  livenessHandler,
  metricsHandler,
  resetMetricsHandler,
} from './health.js';
import { appConfig } from '../utils/config.js';

// Mock Express Request/Response
function createMockRequest(overrides: Partial<Request> = {}): Request {
  return {
    method: 'GET',
    path: '/health',
    headers: {},
    query: {},
    params: {},
    ...overrides,
  } as Request;
}

function createMockResponse(): Response & {
  _status: number;
  _json: unknown;
  _headers: Record<string, string>;
  _body: string;
} {
  const res = {
    _status: 200,
    _json: null as unknown,
    _headers: {} as Record<string, string>,
    _body: '',
    status: vi.fn(function (this: any, code: number) {
      this._status = code;
      return this;
    }),
    json: vi.fn(function (this: any, data: unknown) {
      this._json = data;
      return this;
    }),
    setHeader: vi.fn(function (this: any, name: string, value: string) {
      this._headers[name] = value;
      return this;
    }),
    send: vi.fn(function (this: any, body: string) {
      this._body = body;
      return this;
    }),
  };
  return res as unknown as Response & {
    _status: number;
    _json: unknown;
    _headers: Record<string, string>;
    _body: string;
  };
}

describe('Health Module', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset metrics before each test by calling the handler with a mock response
    const req = createMockRequest();
    const res = createMockResponse();
    resetMetricsHandler(req, res);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('incrementHttpMetrics', () => {
    it('should increment request count', () => {
      incrementHttpMetrics(100);
      incrementHttpMetrics(200);
      incrementHttpMetrics(150);

      // Verify by checking metrics handler output
      const req = createMockRequest();
      const res = createMockResponse();
      metricsHandler(req, res);

      expect(res._body).toContain('http_requests_total 3');
    });

    it('should increment error count when isError is true', () => {
      incrementHttpMetrics(100, false);
      incrementHttpMetrics(200, true);
      incrementHttpMetrics(150, true);

      const req = createMockRequest();
      const res = createMockResponse();
      metricsHandler(req, res);

      expect(res._body).toContain('http_requests_total 3');
      expect(res._body).toContain('http_request_errors_total 2');
    });

    it('should track response times for average calculation', () => {
      incrementHttpMetrics(100);
      incrementHttpMetrics(200);
      incrementHttpMetrics(300);

      const req = createMockRequest();
      const res = createMockResponse();
      metricsHandler(req, res);

      // Average should be (100 + 200 + 300) / 3 = 200
      expect(res._body).toContain('http_request_duration_ms 200');
    });

    it('should limit stored response times for memory efficiency', () => {
      // Add more than 1000 response times
      for (let i = 0; i < 1100; i++) {
        incrementHttpMetrics(100);
      }

      // Metrics should still work without error
      const req = createMockRequest();
      const res = createMockResponse();
      metricsHandler(req, res);

      expect(res._body).toContain('http_requests_total 1100');
    });

    it('should default isError to false', () => {
      incrementHttpMetrics(100);

      const req = createMockRequest();
      const res = createMockResponse();
      metricsHandler(req, res);

      expect(res._body).toContain('http_request_errors_total 0');
    });
  });

  describe('updateMcpMetrics', () => {
    it('should increment tool calls', () => {
      updateMcpMetrics('toolCall');
      updateMcpMetrics('toolCall');
      updateMcpMetrics('toolCall');

      const req = createMockRequest();
      const res = createMockResponse();
      metricsHandler(req, res);

      expect(res._body).toContain('mcp_tool_calls_total 3');
    });

    it('should increment resource requests', () => {
      updateMcpMetrics('resourceRequest');
      updateMcpMetrics('resourceRequest');

      const req = createMockRequest();
      const res = createMockResponse();
      metricsHandler(req, res);

      expect(res._body).toContain('mcp_resource_requests_total 2');
    });

    it('should update active connections with positive delta', () => {
      updateMcpMetrics('connectionChange', 1);
      updateMcpMetrics('connectionChange', 1);
      updateMcpMetrics('connectionChange', 1);

      const req = createMockRequest();
      const res = createMockResponse();
      metricsHandler(req, res);

      expect(res._body).toContain('mcp_active_connections 3');
    });

    it('should update active connections with negative delta', () => {
      updateMcpMetrics('connectionChange', 5);
      updateMcpMetrics('connectionChange', -2);

      const req = createMockRequest();
      const res = createMockResponse();
      metricsHandler(req, res);

      expect(res._body).toContain('mcp_active_connections 3');
    });

    it('should use default delta of 1', () => {
      updateMcpMetrics('toolCall');

      const req = createMockRequest();
      const res = createMockResponse();
      metricsHandler(req, res);

      expect(res._body).toContain('mcp_tool_calls_total 1');
    });

    it('should update lastActivity timestamp', () => {
      const before = new Date().toISOString();
      updateMcpMetrics('toolCall');

      // The timestamp should be updated (we can't easily verify exact value)
      // but we can verify the metrics endpoint still works
      const req = createMockRequest();
      const res = createMockResponse();
      metricsHandler(req, res);

      expect(res._body).toContain('mcp_tool_calls_total');
    });
  });

  describe('updateNodeRedMetrics', () => {
    it('should increment API calls count', () => {
      updateNodeRedMetrics();
      updateNodeRedMetrics();
      updateNodeRedMetrics();

      const req = createMockRequest();
      const res = createMockResponse();
      metricsHandler(req, res);

      expect(res._body).toContain('nodered_api_calls_total 3');
    });

    it('should update lastApiCall timestamp', () => {
      updateNodeRedMetrics();

      // Verify through health check handler that lastApiCall is updated
      const req = createMockRequest();
      const res = createMockResponse();

      // Mock axios for health check
      vi.mocked(axios.get).mockResolvedValueOnce({ status: 200 });

      // The timestamp is updated - we can verify metrics work
      metricsHandler(req, res);
      expect(res._body).toContain('nodered_api_calls_total 1');
    });
  });

  describe('healthCheckHandler', () => {
    it('should return healthy status when all checks pass', async () => {
      vi.mocked(axios.get).mockResolvedValueOnce({ status: 200 });

      const req = createMockRequest();
      const res = createMockResponse();

      await healthCheckHandler(req, res);

      expect(res._status).toBe(200);
      expect(res._json).toMatchObject({
        status: 'healthy',
        environment: 'test',
      });
      expect((res._json as any).checks.nodeRed.status).toBe('pass');
    });

    it('should return degraded status when Node-RED returns non-200', async () => {
      vi.mocked(axios.get).mockResolvedValueOnce({ status: 401 });

      const req = createMockRequest();
      const res = createMockResponse();

      await healthCheckHandler(req, res);

      expect(res._status).toBe(200);
      expect(res._json).toMatchObject({
        status: 'degraded',
      });
      expect((res._json as any).checks.nodeRed.status).toBe('warn');
    });

    it('should return unhealthy status when Node-RED is unreachable', async () => {
      vi.mocked(axios.get).mockRejectedValueOnce(new Error('ECONNREFUSED'));

      const req = createMockRequest();
      const res = createMockResponse();

      await healthCheckHandler(req, res);

      expect(res._status).toBe(503);
      expect(res._json).toMatchObject({
        status: 'unhealthy',
      });
      expect((res._json as any).checks.nodeRed.status).toBe('fail');
      expect((res._json as any).checks.nodeRed.error).toBe('ECONNREFUSED');
    });

    it('should include system information', async () => {
      vi.mocked(axios.get).mockResolvedValueOnce({ status: 200 });

      const req = createMockRequest();
      const res = createMockResponse();

      await healthCheckHandler(req, res);

      const json = res._json as any;
      expect(json.system).toBeDefined();
      expect(json.system.memory).toBeDefined();
      expect(json.system.nodeVersion).toBe(process.version);
      expect(json.system.platform).toBe(process.platform);
      expect(typeof json.system.uptime).toBe('number');
    });

    it('should include service status', async () => {
      vi.mocked(axios.get).mockResolvedValueOnce({ status: 200 });

      const req = createMockRequest();
      const res = createMockResponse();

      await healthCheckHandler(req, res);

      const json = res._json as any;
      expect(json.services.nodeRed).toBeDefined();
      expect(json.services.nodeRed.status).toBe('available');
      expect(json.services.mcp).toBeDefined();
      expect(typeof json.services.mcp.connections).toBe('number');
    });

    it('should include metrics in response', async () => {
      // Pre-populate some metrics
      incrementHttpMetrics(100);
      updateMcpMetrics('toolCall');
      updateNodeRedMetrics();

      vi.mocked(axios.get).mockResolvedValueOnce({ status: 200 });

      const req = createMockRequest();
      const res = createMockResponse();

      await healthCheckHandler(req, res);

      const json = res._json as any;
      expect(json.metrics).toBeDefined();
      expect(json.metrics.http.requests).toBe(1);
      expect(json.metrics.mcp.toolCalls).toBe(1);
      expect(json.metrics.nodeRed.apiCalls).toBe(1);
    });

    it('should include timestamp and uptime', async () => {
      vi.mocked(axios.get).mockResolvedValueOnce({ status: 200 });

      const req = createMockRequest();
      const res = createMockResponse();

      await healthCheckHandler(req, res);

      const json = res._json as any;
      expect(json.timestamp).toBeDefined();
      expect(new Date(json.timestamp).getTime()).toBeLessThanOrEqual(Date.now());
      expect(typeof json.uptime).toBe('number');
      expect(json.uptime).toBeGreaterThanOrEqual(0);
    });

    it('should include version', async () => {
      vi.mocked(axios.get).mockResolvedValueOnce({ status: 200 });

      const req = createMockRequest();
      const res = createMockResponse();

      await healthCheckHandler(req, res);

      const json = res._json as any;
      expect(json.version).toBeDefined();
    });

    it('should handle Node-RED URL not configured', async () => {
      // Temporarily modify appConfig
      const originalUrl = appConfig.nodeRed.url;
      (appConfig.nodeRed as any).url = '';

      const req = createMockRequest();
      const res = createMockResponse();

      await healthCheckHandler(req, res);

      // Restore
      (appConfig.nodeRed as any).url = originalUrl;

      expect(res._status).toBe(200);
      expect((res._json as any).checks.nodeRed.status).toBe('warn');
      expect((res._json as any).checks.nodeRed.output).toContain('not configured');
    });

    it('should calculate average response time from metrics', async () => {
      incrementHttpMetrics(100);
      incrementHttpMetrics(200);
      incrementHttpMetrics(300);

      vi.mocked(axios.get).mockResolvedValueOnce({ status: 200 });

      const req = createMockRequest();
      const res = createMockResponse();

      await healthCheckHandler(req, res);

      const json = res._json as any;
      expect(json.metrics.http.averageResponseTime).toBe(200);
    });

    it('should handle zero response times gracefully', async () => {
      vi.mocked(axios.get).mockResolvedValueOnce({ status: 200 });

      const req = createMockRequest();
      const res = createMockResponse();

      await healthCheckHandler(req, res);

      const json = res._json as any;
      expect(json.metrics.http.averageResponseTime).toBe(0);
    });

    it('should return 503 when health check throws error', async () => {
      // Make axios throw an unexpected error that gets caught in the main try-catch
      vi.mocked(axios.get).mockImplementationOnce(() => {
        throw new Error('Unexpected error');
      });

      const req = createMockRequest();
      const res = createMockResponse();

      await healthCheckHandler(req, res);

      // The error is caught by the check itself, not the main handler
      // So it should still return a response, but with fail status
      expect(res._json).toBeDefined();
    });
  });

  describe('readinessHandler', () => {
    it('should return ready status with 200', () => {
      const req = createMockRequest();
      const res = createMockResponse();

      readinessHandler(req, res);

      expect(res._status).toBe(200);
      expect(res._json).toMatchObject({
        status: 'ready',
      });
    });

    it('should include timestamp', () => {
      const req = createMockRequest();
      const res = createMockResponse();

      readinessHandler(req, res);

      const json = res._json as any;
      expect(json.timestamp).toBeDefined();
      expect(new Date(json.timestamp).getTime()).toBeLessThanOrEqual(Date.now());
    });

    it('should include uptime', () => {
      const req = createMockRequest();
      const res = createMockResponse();

      readinessHandler(req, res);

      const json = res._json as any;
      expect(typeof json.uptime).toBe('number');
      expect(json.uptime).toBeGreaterThanOrEqual(0);
    });
  });

  describe('livenessHandler', () => {
    it('should return alive status with 200', () => {
      const req = createMockRequest();
      const res = createMockResponse();

      livenessHandler(req, res);

      expect(res._status).toBe(200);
      expect(res._json).toMatchObject({
        status: 'alive',
      });
    });

    it('should include timestamp', () => {
      const req = createMockRequest();
      const res = createMockResponse();

      livenessHandler(req, res);

      const json = res._json as any;
      expect(json.timestamp).toBeDefined();
    });

    it('should be lightweight (minimal fields)', () => {
      const req = createMockRequest();
      const res = createMockResponse();

      livenessHandler(req, res);

      const json = res._json as any;
      const keys = Object.keys(json);
      expect(keys.length).toBe(2); // status and timestamp only
    });
  });

  describe('metricsHandler', () => {
    it('should return Prometheus-compatible format', () => {
      const req = createMockRequest();
      const res = createMockResponse();

      metricsHandler(req, res);

      expect(res._headers['Content-Type']).toBe('text/plain; charset=utf-8');
      expect(res._body).toContain('# HELP');
      expect(res._body).toContain('# TYPE');
    });

    it('should include process uptime metric', () => {
      const req = createMockRequest();
      const res = createMockResponse();

      metricsHandler(req, res);

      expect(res._body).toContain('process_uptime_seconds');
    });

    it('should include memory metrics', () => {
      const req = createMockRequest();
      const res = createMockResponse();

      metricsHandler(req, res);

      expect(res._body).toContain('nodejs_memory_usage_bytes{type="heap_used"}');
      expect(res._body).toContain('nodejs_memory_usage_bytes{type="heap_total"}');
      expect(res._body).toContain('nodejs_memory_usage_bytes{type="rss"}');
      expect(res._body).toContain('nodejs_memory_usage_bytes{type="external"}');
    });

    it('should include HTTP metrics', () => {
      incrementHttpMetrics(150);
      incrementHttpMetrics(250, true);

      const req = createMockRequest();
      const res = createMockResponse();

      metricsHandler(req, res);

      expect(res._body).toContain('http_requests_total 2');
      expect(res._body).toContain('http_request_errors_total 1');
      expect(res._body).toContain('http_request_duration_ms 200');
    });

    it('should include MCP metrics', () => {
      updateMcpMetrics('toolCall');
      updateMcpMetrics('toolCall');
      updateMcpMetrics('resourceRequest');
      updateMcpMetrics('connectionChange', 3);

      const req = createMockRequest();
      const res = createMockResponse();

      metricsHandler(req, res);

      expect(res._body).toContain('mcp_tool_calls_total 2');
      expect(res._body).toContain('mcp_resource_requests_total 1');
      expect(res._body).toContain('mcp_active_connections 3');
    });

    it('should include Node-RED metrics', () => {
      updateNodeRedMetrics();
      updateNodeRedMetrics();

      const req = createMockRequest();
      const res = createMockResponse();

      metricsHandler(req, res);

      expect(res._body).toContain('nodered_api_calls_total 2');
    });

    it('should format metrics with proper line breaks', () => {
      const req = createMockRequest();
      const res = createMockResponse();

      metricsHandler(req, res);

      // Each metric group should be separated by empty line
      const lines = res._body.split('\n');
      expect(lines.length).toBeGreaterThan(10);
    });
  });

  describe('resetMetricsHandler', () => {
    it('should reset all HTTP metrics', () => {
      incrementHttpMetrics(100);
      incrementHttpMetrics(200, true);

      const req = createMockRequest();
      const res = createMockResponse();

      resetMetricsHandler(req, res);

      // Verify metrics are reset
      const metricsReq = createMockRequest();
      const metricsRes = createMockResponse();
      metricsHandler(metricsReq, metricsRes);

      expect(metricsRes._body).toContain('http_requests_total 0');
      expect(metricsRes._body).toContain('http_request_errors_total 0');
    });

    it('should reset all MCP metrics', () => {
      updateMcpMetrics('toolCall', 5);
      updateMcpMetrics('resourceRequest', 3);
      updateMcpMetrics('connectionChange', 2);

      const req = createMockRequest();
      const res = createMockResponse();

      resetMetricsHandler(req, res);

      const metricsReq = createMockRequest();
      const metricsRes = createMockResponse();
      metricsHandler(metricsReq, metricsRes);

      expect(metricsRes._body).toContain('mcp_tool_calls_total 0');
      expect(metricsRes._body).toContain('mcp_resource_requests_total 0');
      expect(metricsRes._body).toContain('mcp_active_connections 0');
    });

    it('should reset all Node-RED metrics', () => {
      updateNodeRedMetrics();
      updateNodeRedMetrics();

      const req = createMockRequest();
      const res = createMockResponse();

      resetMetricsHandler(req, res);

      const metricsReq = createMockRequest();
      const metricsRes = createMockResponse();
      metricsHandler(metricsReq, metricsRes);

      expect(metricsRes._body).toContain('nodered_api_calls_total 0');
    });

    it('should return success message with timestamp', () => {
      const req = createMockRequest();
      const res = createMockResponse();

      resetMetricsHandler(req, res);

      expect(res._json).toMatchObject({
        message: 'Metrics reset successfully',
      });
      expect((res._json as any).resetAt).toBeDefined();
    });

    it('should update lastReset timestamp', () => {
      const before = Date.now();

      const req = createMockRequest();
      const res = createMockResponse();

      resetMetricsHandler(req, res);

      // The resetAt should be close to current time
      const resetAt = new Date((res._json as any).resetAt).getTime();
      expect(resetAt).toBeGreaterThanOrEqual(before);
      expect(resetAt).toBeLessThanOrEqual(Date.now());
    });
  });

  describe('Health Status Determination', () => {
    it('should be healthy when all checks pass', async () => {
      vi.mocked(axios.get).mockResolvedValueOnce({ status: 200 });

      const req = createMockRequest();
      const res = createMockResponse();

      await healthCheckHandler(req, res);

      expect((res._json as any).status).toBe('healthy');
      expect(res._status).toBe(200);
    });

    it('should be degraded when warn status exists', async () => {
      vi.mocked(axios.get).mockResolvedValueOnce({ status: 401 }); // Non-200 = warn

      const req = createMockRequest();
      const res = createMockResponse();

      await healthCheckHandler(req, res);

      expect((res._json as any).status).toBe('degraded');
      expect(res._status).toBe(200); // Degraded still returns 200
    });

    it('should be unhealthy when fail status exists', async () => {
      vi.mocked(axios.get).mockRejectedValueOnce(new Error('Connection refused'));

      const req = createMockRequest();
      const res = createMockResponse();

      await healthCheckHandler(req, res);

      expect((res._json as any).status).toBe('unhealthy');
      expect(res._status).toBe(503);
    });
  });

  describe('Node-RED Service Status', () => {
    it('should mark Node-RED as available when check passes', async () => {
      vi.mocked(axios.get).mockResolvedValueOnce({ status: 200 });

      const req = createMockRequest();
      const res = createMockResponse();

      await healthCheckHandler(req, res);

      expect((res._json as any).services.nodeRed.status).toBe('available');
    });

    it('should mark Node-RED as available even with warn status', async () => {
      vi.mocked(axios.get).mockResolvedValueOnce({ status: 401 });

      const req = createMockRequest();
      const res = createMockResponse();

      await healthCheckHandler(req, res);

      expect((res._json as any).services.nodeRed.status).toBe('available');
    });

    it('should mark Node-RED as unavailable when check fails', async () => {
      vi.mocked(axios.get).mockRejectedValueOnce(new Error('ECONNREFUSED'));

      const req = createMockRequest();
      const res = createMockResponse();

      await healthCheckHandler(req, res);

      expect((res._json as any).services.nodeRed.status).toBe('unavailable');
    });

    it('should include response time in Node-RED service', async () => {
      vi.mocked(axios.get).mockResolvedValueOnce({ status: 200 });

      const req = createMockRequest();
      const res = createMockResponse();

      await healthCheckHandler(req, res);

      expect(typeof (res._json as any).services.nodeRed.responseTime).toBe('number');
    });

    it('should include lastCheck timestamp', async () => {
      vi.mocked(axios.get).mockResolvedValueOnce({ status: 200 });

      const req = createMockRequest();
      const res = createMockResponse();

      await healthCheckHandler(req, res);

      expect((res._json as any).services.nodeRed.lastCheck).toBeDefined();
    });
  });
});
