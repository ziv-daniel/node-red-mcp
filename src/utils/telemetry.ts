/**
 * OpenTelemetry configuration for distributed tracing and metrics
 * 2025 Observability Standards
 */

import { trace, metrics, SpanStatusCode, SpanKind } from '@opentelemetry/api';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { Resource } from '@opentelemetry/resources';
import { NodeSDK } from '@opentelemetry/sdk-node';

import { appConfig } from './config.js';
import { logger } from './logger.js';

// Service information
const SERVICE_NAME = 'mcp-nodered-server';
const SERVICE_VERSION = process.env.npm_package_version || '1.0.0';

/**
 * Initialize OpenTelemetry SDK
 */
export function initializeTelemetry(): NodeSDK | null {
  try {
    // Skip telemetry in test environment unless explicitly enabled
    if (appConfig.app.isTest && !process.env.ENABLE_TELEMETRY_IN_TESTS) {
      return null;
    }

    const sdk = new NodeSDK({
      serviceName: SERVICE_NAME,
      serviceVersion: SERVICE_VERSION,

      // Auto-instrumentations for common libraries
      instrumentations: [
        getNodeAutoInstrumentations({
          // Enable/disable specific instrumentations
          '@opentelemetry/instrumentation-fs': { enabled: false }, // Disable file system tracing (too noisy)
          '@opentelemetry/instrumentation-http': {
            enabled: true,
            requestHook: (span, request) => {
              // Add custom attributes to HTTP spans
              span.setAttributes({
                'http.request.id': generateTraceId(),
                'service.name': SERVICE_NAME,
              });
            },
          },
          '@opentelemetry/instrumentation-express': {
            enabled: true,
            requestHook: (span, info) => {
              // Add route information
              if (info.route) {
                span.setAttributes({
                  'express.route': info.route,
                  'express.method': info.request.method,
                });
              }
            },
          },
        }),
      ],

      // Resource attributes
      resource: new Resource({
        'service.name': SERVICE_NAME,
        'service.version': SERVICE_VERSION,
        'service.environment': appConfig.app.nodeEnv,
        'deployment.environment': appConfig.app.nodeEnv,
      }),

      // Tracing configuration
      tracing: {
        // Export spans to console in development
        exporter: appConfig.app.isDevelopment ? { type: 'console' } : { type: 'jaeger' }, // Use Jaeger in production
      },
    });

    // Initialize the SDK
    sdk.start();

    logger.info(
      {
        service: SERVICE_NAME,
        version: SERVICE_VERSION,
        environment: appConfig.app.nodeEnv,
      },
      'OpenTelemetry initialized'
    );

    return sdk;
  } catch (error) {
    logger.error({ error }, 'Failed to initialize OpenTelemetry');
    return null;
  }
}

// Get tracer instance
export const tracer = trace.getTracer(SERVICE_NAME, SERVICE_VERSION);

// Get metrics instance
export const meter = metrics.getMeter(SERVICE_NAME, SERVICE_VERSION);

/**
 * Generate a unique trace ID
 */
export function generateTraceId(): string {
  return `trace_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Create a new span with common attributes
 */
export function createSpan(
  name: string,
  options: {
    kind?: SpanKind;
    attributes?: Record<string, string | number | boolean>;
    parent?: any;
  } = {}
) {
  return tracer.startSpan(name, {
    kind: options.kind || SpanKind.INTERNAL,
    attributes: {
      'service.name': SERVICE_NAME,
      ...options.attributes,
    },
    // parent: options.parent, // Removed as it's not a valid SpanOptions property
  });
}

/**
 * MCP-specific tracing utilities
 */
export const mcpTracing = {
  /**
   * Trace MCP tool calls
   */
  traceToolCall: <T>(
    toolName: string,
    args: Record<string, unknown>,
    fn: () => Promise<T>
  ): Promise<T> => {
    const span = createSpan(`mcp.tool.${toolName}`, {
      kind: SpanKind.SERVER,
      attributes: {
        'mcp.tool.name': toolName,
        'mcp.tool.args_count': Object.keys(args).length,
        'mcp.operation': 'tool_call',
      },
    });

    return executeWithSpan(span, fn);
  },

  /**
   * Trace MCP resource requests
   */
  traceResourceRequest: <T>(resourceName: string, fn: () => Promise<T>): Promise<T> => {
    const span = createSpan(`mcp.resource.${resourceName}`, {
      kind: SpanKind.SERVER,
      attributes: {
        'mcp.resource.name': resourceName,
        'mcp.operation': 'resource_request',
      },
    });

    return executeWithSpan(span, fn);
  },

  /**
   * Trace MCP server operations
   */
  traceServerOperation: <T>(operation: string, fn: () => Promise<T>): Promise<T> => {
    const span = createSpan(`mcp.server.${operation}`, {
      kind: SpanKind.SERVER,
      attributes: {
        'mcp.server.operation': operation,
      },
    });

    return executeWithSpan(span, fn);
  },
};

/**
 * Node-RED specific tracing utilities
 */
export const nodeRedTracing = {
  /**
   * Trace Node-RED API calls
   */
  traceApiCall: <T>(endpoint: string, method: string, fn: () => Promise<T>): Promise<T> => {
    const span = createSpan(`nodered.api.${method.toLowerCase()}.${endpoint.replace(/\//g, '.')}`, {
      kind: SpanKind.CLIENT,
      attributes: {
        'nodered.api.endpoint': endpoint,
        'nodered.api.method': method,
        'http.method': method,
        'http.url': `${appConfig.nodeRed.url}${endpoint}`,
      },
    });

    return executeWithSpan(span, fn);
  },

  /**
   * Trace flow operations
   */
  traceFlowOperation: <T>(operation: string, flowId: string, fn: () => Promise<T>): Promise<T> => {
    const span = createSpan(`nodered.flow.${operation}`, {
      attributes: {
        'nodered.flow.id': flowId,
        'nodered.flow.operation': operation,
      },
    });

    return executeWithSpan(span, fn);
  },
};

/**
 * Execute a function within a span context
 */
async function executeWithSpan<T>(span: any, fn: () => Promise<T>): Promise<T> {
  const startTime = Date.now();

  try {
    const result = await fn();

    // Mark span as successful
    span.setStatus({ code: SpanStatusCode.OK });
    span.setAttributes({
      'operation.success': true,
      'operation.duration_ms': Date.now() - startTime,
    });

    return result;
  } catch (error) {
    // Mark span as failed
    span.setStatus({
      code: SpanStatusCode.ERROR,
      message: error instanceof Error ? error.message : 'Unknown error',
    });

    span.setAttributes({
      'operation.success': false,
      'operation.duration_ms': Date.now() - startTime,
      'error.name': error instanceof Error ? error.name : 'UnknownError',
      'error.message': error instanceof Error ? error.message : String(error),
    });

    // Record the error
    if (error instanceof Error) {
      span.recordException(error);
    }

    throw error;
  } finally {
    span.end();
  }
}

/**
 * Custom metrics for MCP operations
 */
export const mcpMetrics = {
  // Counter for tool calls
  toolCallCounter: meter.createCounter('mcp_tool_calls_total', {
    description: 'Total number of MCP tool calls',
  }),

  // Histogram for tool call duration
  toolCallDuration: meter.createHistogram('mcp_tool_call_duration_ms', {
    description: 'Duration of MCP tool calls in milliseconds',
  }),

  // Counter for resource requests
  resourceRequestCounter: meter.createCounter('mcp_resource_requests_total', {
    description: 'Total number of MCP resource requests',
  }),

  // Gauge for active connections
  activeConnections: meter.createUpDownCounter('mcp_active_connections', {
    description: 'Number of active MCP connections',
  }),

  /**
   * Record a tool call metric
   */
  recordToolCall: (toolName: string, duration: number, success: boolean) => {
    mcpMetrics.toolCallCounter.add(1, {
      tool_name: toolName,
      success: success.toString(),
    });

    mcpMetrics.toolCallDuration.record(duration, {
      tool_name: toolName,
      success: success.toString(),
    });
  },

  /**
   * Record a resource request metric
   */
  recordResourceRequest: (resourceName: string) => {
    mcpMetrics.resourceRequestCounter.add(1, {
      resource_name: resourceName,
    });
  },

  /**
   * Update active connections count
   */
  updateActiveConnections: (delta: number) => {
    mcpMetrics.activeConnections.add(delta);
  },
};

/**
 * Node-RED specific metrics
 */
export const nodeRedMetrics = {
  // Counter for API calls
  apiCallCounter: meter.createCounter('nodered_api_calls_total', {
    description: 'Total number of Node-RED API calls',
  }),

  // Histogram for API call duration
  apiCallDuration: meter.createHistogram('nodered_api_call_duration_ms', {
    description: 'Duration of Node-RED API calls in milliseconds',
  }),

  /**
   * Record an API call metric
   */
  recordApiCall: (endpoint: string, method: string, statusCode: number, duration: number) => {
    nodeRedMetrics.apiCallCounter.add(1, {
      endpoint,
      method,
      status_code: statusCode.toString(),
      success: (statusCode < 400).toString(),
    });

    nodeRedMetrics.apiCallDuration.record(duration, {
      endpoint,
      method,
      status_code: statusCode.toString(),
    });
  },
};

/**
 * Graceful telemetry shutdown
 */
export async function shutdownTelemetry(sdk: NodeSDK | null): Promise<void> {
  if (sdk) {
    try {
      await sdk.shutdown();
      logger.info('OpenTelemetry shutdown completed');
    } catch (error) {
      logger.error({ error }, 'Error during OpenTelemetry shutdown');
    }
  }
}
