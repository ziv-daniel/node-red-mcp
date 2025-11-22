/**
 * Health check and metrics endpoints
 * 2025 Observability & Monitoring Implementation
 */

import { performance } from 'perf_hooks';
import os from 'os';

import axios from 'axios';
import type { Request, Response } from 'express';

import { appConfig } from '../utils/config.js';
import { logger, logPerformance } from '../utils/logger.js';
// Metrics imports available if needed
// import { mcpMetrics, nodeRedMetrics } from '../utils/telemetry.js';

interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  uptime: number;
  version: string;
  environment: string;
  checks: Record<
    string,
    {
      status: 'pass' | 'warn' | 'fail';
      time: number;
      output?: string;
      error?: string;
    }
  >;
  system: {
    memory: NodeJS.MemoryUsage;
    loadavg: number[];
    uptime: number;
    nodeVersion: string;
    platform: string;
  };
  services: {
    nodeRed: {
      status: 'available' | 'unavailable' | 'unknown';
      responseTime?: number;
      lastCheck: string;
    };
    mcp: {
      connections: number;
      activeTools: number;
      lastActivity: string;
    };
  };
  metrics?: {
    http: {
      requests: number;
      errors: number;
      averageResponseTime: number;
    };
    mcp: {
      toolCalls: number;
      resourceRequests: number;
      activeConnections: number;
    };
    nodeRed: {
      apiCalls: number;
      lastApiCall: string;
    };
  };
}

// In-memory metrics storage (replace with Redis/database in production)
const metricsStore = {
  http: {
    requests: 0,
    errors: 0,
    responseTimes: [] as number[],
    lastReset: Date.now(),
  },
  mcp: {
    toolCalls: 0,
    resourceRequests: 0,
    activeConnections: 0,
    lastActivity: new Date().toISOString(),
  },
  nodeRed: {
    apiCalls: 0,
    lastApiCall: new Date().toISOString(),
  },
};

/**
 * Increment HTTP request metrics
 */
export function incrementHttpMetrics(responseTime: number, isError = false) {
  metricsStore.http.requests++;
  if (isError) {
    metricsStore.http.errors++;
  }
  metricsStore.http.responseTimes.push(responseTime);

  // Keep only last 1000 response times for memory efficiency
  if (metricsStore.http.responseTimes.length > 1000) {
    metricsStore.http.responseTimes = metricsStore.http.responseTimes.slice(-500);
  }
}

/**
 * Update MCP metrics
 */
export function updateMcpMetrics(
  type: 'toolCall' | 'resourceRequest' | 'connectionChange',
  delta = 1
) {
  metricsStore.mcp.lastActivity = new Date().toISOString();

  switch (type) {
    case 'toolCall':
      metricsStore.mcp.toolCalls += delta;
      break;
    case 'resourceRequest':
      metricsStore.mcp.resourceRequests += delta;
      break;
    case 'connectionChange':
      metricsStore.mcp.activeConnections += delta;
      break;
  }
}

/**
 * Update Node-RED metrics
 */
export function updateNodeRedMetrics() {
  metricsStore.nodeRed.apiCalls++;
  metricsStore.nodeRed.lastApiCall = new Date().toISOString();
}

/**
 * Check Node-RED availability
 */
async function checkNodeRedHealth(): Promise<{
  status: 'pass' | 'warn' | 'fail';
  responseTime?: number;
  output?: string;
  error?: string;
}> {
  if (!appConfig.nodeRed.url) {
    return {
      status: 'warn',
      output: 'Node-RED URL not configured',
    };
  }

  const startTime = performance.now();

  try {
    const response = await axios.get(`${appConfig.nodeRed.url}/admin`, {
      timeout: 5000,
      headers: {
        'User-Agent': 'MCP-NodeRED-Server/1.0.0',
      },
      validateStatus: status => status < 500, // Accept any non-5xx status
    });

    const responseTime = Math.round(performance.now() - startTime);

    if (response.status === 200) {
      return {
        status: 'pass',
        responseTime,
        output: `Node-RED available (${response.status})`,
      };
    } else {
      return {
        status: 'warn',
        responseTime,
        output: `Node-RED responded with status ${response.status}`,
      };
    }
  } catch (error) {
    const responseTime = Math.round(performance.now() - startTime);

    return {
      status: 'fail',
      responseTime,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Check system resources
 */
function checkSystemHealth(): {
  status: 'pass' | 'warn' | 'fail';
  output?: string;
} {
  const memoryUsage = process.memoryUsage();
  const memoryUsedMB = Math.round(memoryUsage.heapUsed / 1024 / 1024);
  const memoryTotalMB = Math.round(memoryUsage.heapTotal / 1024 / 1024);
  const memoryUtilization = (memoryUsage.heapUsed / memoryUsage.heapTotal) * 100;

  // Warning if memory utilization > 80%
  if (memoryUtilization > 80) {
    return {
      status: 'warn',
      output: `High memory utilization: ${Math.round(memoryUtilization)}% (${memoryUsedMB}MB/${memoryTotalMB}MB)`,
    };
  }

  // Critical if memory utilization > 95%
  if (memoryUtilization > 95) {
    return {
      status: 'fail',
      output: `Critical memory utilization: ${Math.round(memoryUtilization)}% (${memoryUsedMB}MB/${memoryTotalMB}MB)`,
    };
  }

  return {
    status: 'pass',
    output: `Memory utilization: ${Math.round(memoryUtilization)}% (${memoryUsedMB}MB/${memoryTotalMB}MB)`,
  };
}

/**
 * Main health check handler
 */
export async function healthCheckHandler(req: Request, res: Response): Promise<void> {
  const startTime = performance.now();

  try {
    // Run health checks in parallel
    const [nodeRedCheck, systemCheck] = await Promise.allSettled([
      checkNodeRedHealth(),
      Promise.resolve(checkSystemHealth()),
    ]);

    const checks: HealthStatus['checks'] = {
      system:
        systemCheck.status === 'fulfilled'
          ? { ...systemCheck.value, time: Math.round(performance.now() - startTime) }
          : {
              status: 'fail',
              time: Math.round(performance.now() - startTime),
              error: 'System check failed',
            },

      nodeRed:
        nodeRedCheck.status === 'fulfilled'
          ? { ...nodeRedCheck.value, time: Math.round(performance.now() - startTime) }
          : {
              status: 'fail',
              time: Math.round(performance.now() - startTime),
              error: 'Node-RED check failed',
            },
    };

    // Determine overall health status
    const checkStatuses = Object.values(checks).map(check => check.status);
    const overallStatus: HealthStatus['status'] = checkStatuses.includes('fail')
      ? 'unhealthy'
      : checkStatuses.includes('warn')
        ? 'degraded'
        : 'healthy';

    // Calculate average response time
    const avgResponseTime =
      metricsStore.http.responseTimes.length > 0
        ? Math.round(
            metricsStore.http.responseTimes.reduce((a, b) => a + b, 0) /
              metricsStore.http.responseTimes.length
          )
        : 0;

    const healthStatus: HealthStatus = {
      status: overallStatus,
      timestamp: new Date().toISOString(),
      uptime: Math.round(process.uptime()),
      version: process.env.npm_package_version || '1.0.0',
      environment: appConfig.app.nodeEnv,
      checks,
      system: {
        memory: process.memoryUsage(),
        loadavg: process.platform === 'linux' ? os.loadavg() : [0, 0, 0],
        uptime: Math.round(process.uptime()),
        nodeVersion: process.version,
        platform: process.platform,
      },
      services: {
        nodeRed: {
          status:
            checks.nodeRed?.status === 'pass'
              ? 'available'
              : checks.nodeRed?.status === 'warn'
                ? 'available'
                : 'unavailable',
          responseTime: checks.nodeRed?.time ?? 0,
          lastCheck: new Date().toISOString(),
        },
        mcp: {
          connections: metricsStore.mcp.activeConnections,
          activeTools: 10, // This would be dynamic in real implementation
          lastActivity: metricsStore.mcp.lastActivity,
        },
      },
      metrics: {
        http: {
          requests: metricsStore.http.requests,
          errors: metricsStore.http.errors,
          averageResponseTime: avgResponseTime,
        },
        mcp: {
          toolCalls: metricsStore.mcp.toolCalls,
          resourceRequests: metricsStore.mcp.resourceRequests,
          activeConnections: metricsStore.mcp.activeConnections,
        },
        nodeRed: {
          apiCalls: metricsStore.nodeRed.apiCalls,
          lastApiCall: metricsStore.nodeRed.lastApiCall,
        },
      },
    };

    // Set appropriate HTTP status code
    const statusCode = overallStatus === 'healthy' ? 200 : overallStatus === 'degraded' ? 200 : 503;

    // Log performance
    const totalTime = Math.round(performance.now() - startTime);
    logPerformance('health-check', totalTime, { status: overallStatus });

    res.status(statusCode).json(healthStatus);
  } catch (error) {
    logger.error({ error }, 'Health check failed');

    res.status(503).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: error instanceof Error ? error.message : 'Health check failed',
      uptime: Math.round(process.uptime()),
      version: process.env.npm_package_version || '1.0.0',
      environment: appConfig.app.nodeEnv,
    });
  }
}

/**
 * Readiness check (lighter weight for k8s probes)
 */
export function readinessHandler(req: Request, res: Response): void {
  res.status(200).json({
    status: 'ready',
    timestamp: new Date().toISOString(),
    uptime: Math.round(process.uptime()),
  });
}

/**
 * Liveness check (minimal check for k8s probes)
 */
export function livenessHandler(req: Request, res: Response): void {
  res.status(200).json({
    status: 'alive',
    timestamp: new Date().toISOString(),
  });
}

/**
 * Metrics endpoint (Prometheus-compatible)
 */
export function metricsHandler(req: Request, res: Response): void {
  const memoryUsage = process.memoryUsage();
  const avgResponseTime =
    metricsStore.http.responseTimes.length > 0
      ? Math.round(
          metricsStore.http.responseTimes.reduce((a, b) => a + b, 0) /
            metricsStore.http.responseTimes.length
        )
      : 0;

  // Generate Prometheus-style metrics
  const metrics = [
    `# HELP process_uptime_seconds Process uptime in seconds`,
    `# TYPE process_uptime_seconds counter`,
    `process_uptime_seconds ${Math.round(process.uptime())}`,
    ``,
    `# HELP nodejs_memory_usage_bytes Node.js memory usage in bytes`,
    `# TYPE nodejs_memory_usage_bytes gauge`,
    `nodejs_memory_usage_bytes{type="heap_used"} ${memoryUsage.heapUsed}`,
    `nodejs_memory_usage_bytes{type="heap_total"} ${memoryUsage.heapTotal}`,
    `nodejs_memory_usage_bytes{type="rss"} ${memoryUsage.rss}`,
    `nodejs_memory_usage_bytes{type="external"} ${memoryUsage.external}`,
    ``,
    `# HELP http_requests_total Total HTTP requests`,
    `# TYPE http_requests_total counter`,
    `http_requests_total ${metricsStore.http.requests}`,
    ``,
    `# HELP http_request_errors_total Total HTTP request errors`,
    `# TYPE http_request_errors_total counter`,
    `http_request_errors_total ${metricsStore.http.errors}`,
    ``,
    `# HELP http_request_duration_ms Average HTTP request duration`,
    `# TYPE http_request_duration_ms gauge`,
    `http_request_duration_ms ${avgResponseTime}`,
    ``,
    `# HELP mcp_tool_calls_total Total MCP tool calls`,
    `# TYPE mcp_tool_calls_total counter`,
    `mcp_tool_calls_total ${metricsStore.mcp.toolCalls}`,
    ``,
    `# HELP mcp_resource_requests_total Total MCP resource requests`,
    `# TYPE mcp_resource_requests_total counter`,
    `mcp_resource_requests_total ${metricsStore.mcp.resourceRequests}`,
    ``,
    `# HELP mcp_active_connections Current active MCP connections`,
    `# TYPE mcp_active_connections gauge`,
    `mcp_active_connections ${metricsStore.mcp.activeConnections}`,
    ``,
    `# HELP nodered_api_calls_total Total Node-RED API calls`,
    `# TYPE nodered_api_calls_total counter`,
    `nodered_api_calls_total ${metricsStore.nodeRed.apiCalls}`,
  ].join('\n');

  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.send(metrics);
}

/**
 * Reset metrics (for testing/admin use)
 */
export function resetMetricsHandler(req: Request, res: Response): void {
  metricsStore.http = {
    requests: 0,
    errors: 0,
    responseTimes: [],
    lastReset: Date.now(),
  };

  metricsStore.mcp = {
    toolCalls: 0,
    resourceRequests: 0,
    activeConnections: 0,
    lastActivity: new Date().toISOString(),
  };

  metricsStore.nodeRed = {
    apiCalls: 0,
    lastApiCall: new Date().toISOString(),
  };

  logger.info({ resetAt: new Date().toISOString() }, 'Metrics reset');

  res.json({
    message: 'Metrics reset successfully',
    resetAt: new Date().toISOString(),
  });
}
