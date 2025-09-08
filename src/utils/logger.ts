/**
 * Structured logging configuration with Pino
 * 2025 Observability & Monitoring Standards
 */

import pino from 'pino';
import pinoPretty from 'pino-pretty';

import { appConfig } from './config.js';

// Custom log levels for MCP operations
const customLevels = {
  mcp: 25, // Between debug(20) and info(30)
  sse: 25, // For SSE events
  nodered: 25, // For Node-RED interactions
};

/**
 * Create logger instance with environment-appropriate configuration
 */
function createLogger() {
  const isDevelopment = appConfig.app.isDevelopment;
  const isTest = appConfig.app.isTest;
  const logLevel = appConfig.logging.level;

  const baseConfig = {
    name: 'mcp-nodered-server',
    level: logLevel,
    customLevels,
    useOnlyCustomLevels: false,

    // Base fields added to every log entry
    base: {
      pid: process.pid,
      hostname: process.env.HOSTNAME || 'localhost',
      service: 'mcp-nodered-server',
      version: process.env.npm_package_version || '1.0.0',
    },

    // High-resolution timestamps
    timestamp: () => `,"time":"${new Date().toISOString()}"`,

    // Redact sensitive information
    redact: {
      paths: [
        'password',
        'token',
        'authorization',
        'cookie',
        'req.headers.authorization',
        'req.headers.cookie',
        'res.headers["set-cookie"]',
        'JWT_SECRET',
        'NODERED_PASSWORD',
        'API_KEY',
      ],
      censor: '[Redacted]',
    },

    // Error serialization
    serializers: {
      error: pino.stdSerializers.err,
      req: pino.stdSerializers.req,
      res: pino.stdSerializers.res,
    },
  };

  // Development/Test environment: pretty printing
  if (isDevelopment || isTest) {
    const prettyStream = pinoPretty({
      colorize: true,
      translateTime: 'yyyy-mm-dd HH:MM:ss.l',
      ignore: 'pid,hostname',
      messageFormat: '{levelName} [{service}] {msg}',
      customLevels: 'mcp:25,sse:25,nodered:25',
      customColors: 'mcp:blue,sse:magenta,nodered:cyan',
      levelFirst: true,
    });

    return pino(baseConfig, prettyStream);
  }

  // Production environment: structured JSON logging
  return pino({
    ...baseConfig,
    formatters: {
      level: label => ({ level: label.toUpperCase() }),
      bindings: bindings => ({
        service: bindings.name,
        pid: bindings.pid,
        hostname: bindings.hostname,
      }),
    },
  });
}

// Create and export logger instance
export const logger = createLogger();

/**
 * Child logger for specific contexts
 */
export const createChildLogger = (
  context: string,
  additionalFields: Record<string, unknown> = {}
) => logger.child({
    context,
    ...additionalFields,
  });

/**
 * Logger for MCP operations
 */
export const mcpLogger = createChildLogger('mcp', {
  component: 'mcp-server',
});

/**
 * Logger for SSE operations
 */
export const sseLogger = createChildLogger('sse', {
  component: 'sse-handler',
});

/**
 * Logger for Node-RED operations
 */
export const nodeRedLogger = createChildLogger('nodered', {
  component: 'nodered-api',
});

/**
 * Logger for HTTP operations
 */
export const httpLogger = createChildLogger('http', {
  component: 'express-app',
});

/**
 * Request ID generator for tracing
 */
export const generateRequestId = () => `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

/**
 * Enhanced error logging with context
 */
export const logError = (
  error: Error | unknown,
  context?: string,
  metadata?: Record<string, unknown>
) => {
  const errorLogger = context ? createChildLogger(context) : logger;

  const errorInfo =
    error instanceof Error
      ? {
          name: error.name,
          message: error.message,
          stack: error.stack,
        }
      : { error: String(error) };

  errorLogger.error(
    {
      error: errorInfo,
      ...metadata,
    },
    `Error in ${context || 'application'}`
  );
};

/**
 * Performance timing logger
 */
export const logPerformance = (
  operation: string,
  duration: number,
  metadata?: Record<string, unknown>
) => {
  logger.info(
    {
      operation,
      duration,
      performance: true,
      ...metadata,
    },
    `Operation ${operation} completed in ${duration}ms`
  );
};

/**
 * Audit logging for security events
 */
export const logAudit = (action: string, userId?: string, metadata?: Record<string, unknown>) => {
  logger.info(
    {
      audit: true,
      action,
      userId,
      timestamp: new Date().toISOString(),
      ...metadata,
    },
    `Audit: ${action}`
  );
};

/**
 * MCP-specific logging utilities
 */
export const mcpLog = {
  toolCall: (toolName: string, args: Record<string, unknown>, requestId?: string) => {
    mcpLogger.info(
      {
        toolName,
        args,
        requestId,
        action: 'tool-call',
      },
      `MCP tool called: ${toolName}`
    );
  },

  toolResult: (toolName: string, success: boolean, duration: number, requestId?: string) => {
    mcpLogger.info(
      {
        toolName,
        success,
        duration,
        requestId,
        action: 'tool-result',
      },
      `MCP tool ${toolName} ${success ? 'succeeded' : 'failed'} in ${duration}ms`
    );
  },

  resourceRequest: (resourceName: string, requestId?: string) => {
    mcpLogger.info(
      {
        resourceName,
        requestId,
        action: 'resource-request',
      },
      `MCP resource requested: ${resourceName}`
    );
  },
};

/**
 * Node-RED specific logging utilities
 */
export const nodeRedLog = {
  flowOperation: (operation: string, flowId: string, metadata?: Record<string, unknown>) => {
    nodeRedLogger.info(
      {
        operation,
        flowId,
        ...metadata,
      },
      `Node-RED flow ${operation}: ${flowId}`
    );
  },

  nodeOperation: (
    operation: string,
    nodeId: string,
    nodeType: string,
    metadata?: Record<string, unknown>
  ) => {
    nodeRedLogger.info(
      {
        operation,
        nodeId,
        nodeType,
        ...metadata,
      },
      `Node-RED node ${operation}: ${nodeType}/${nodeId}`
    );
  },

  apiCall: (endpoint: string, method: string, statusCode: number, duration: number) => {
    nodeRedLogger.info(
      {
        endpoint,
        method,
        statusCode,
        duration,
        action: 'api-call',
      },
      `Node-RED API ${method} ${endpoint} - ${statusCode} (${duration}ms)`
    );
  },
};

/**
 * Startup/shutdown logging
 */
export const logStartup = (component: string, metadata?: Record<string, unknown>) => {
  logger.info(
    {
      component,
      action: 'startup',
      ...metadata,
    },
    `${component} starting up`
  );
};

export const logShutdown = (component: string, metadata?: Record<string, unknown>) => {
  logger.info(
    {
      component,
      action: 'shutdown',
      ...metadata,
    },
    `${component} shutting down`
  );
};

// Export logger as default for convenience
export default logger;
