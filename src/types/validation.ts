/**
 * Zod validation schemas for runtime type checking and input sanitization
 * Part of the 2025 security hardening initiative
 */

import { z } from 'zod';

// Environment variable validation
export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),

  // MCP Configuration
  MCP_TRANSPORT: z.enum(['stdio', 'http', 'both']).default('stdio'),
  HTTP_ENABLED: z.coerce.boolean().default(false),

  // Node-RED Configuration
  NODERED_URL: z.string().url().default('http://localhost:1880'),
  NODERED_USERNAME: z.string().optional(),
  NODERED_PASSWORD: z.string().optional(),

  // Security Configuration
  JWT_SECRET: z.string().min(32).optional(),
  CORS_ORIGIN: z.string().default('*'),
  RATE_LIMIT_WINDOW: z.coerce.number().int().positive().default(900000), // 15 minutes
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(100),

  // Logging Configuration
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug']).default('info'),
});

// MCP Tool Request validation
export const mcpToolRequestSchema = z.object({
  name: z.string().min(1).max(100),
  arguments: z.record(z.string(), z.unknown()).optional().default({}),
});

// Node-RED Flow validation
export const nodeRedFlowSchema = z.object({
  id: z.string().min(1),
  label: z.string().optional(),
  nodes: z
    .array(
      z.object({
        id: z.string(),
        type: z.string(),
        name: z.string().optional(),
        x: z.number().optional(),
        y: z.number().optional(),
      })
    )
    .optional()
    .default([]),
  configs: z.array(z.unknown()).optional().default([]),
  subflows: z.array(z.unknown()).optional().default([]),
});

// Node-RED Node validation
export const nodeRedNodeSchema = z.object({
  id: z.string().min(1),
  type: z.string().min(1),
  name: z.string().optional(),
  x: z.number().int().optional(),
  y: z.number().int().optional(),
  z: z.string().optional(), // flow/subflow id
  wires: z.array(z.array(z.string())).optional().default([]),
  info: z.string().optional(),
  env: z
    .array(
      z.object({
        name: z.string(),
        value: z.string(),
        type: z.string().optional(),
      })
    )
    .optional()
    .default([]),
});

// HTTP Request validation
export const httpRequestSchema = z.object({
  method: z.enum(['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS']),
  url: z.string().url(),
  headers: z.record(z.string(), z.string()).optional().default({}),
  body: z.unknown().optional(),
  timeout: z.number().int().positive().max(30000).optional().default(10000),
});

// SSE Event validation
export const sseEventSchema = z.object({
  event: z.string().min(1).max(50),
  data: z.unknown(),
  id: z.string().optional(),
  retry: z.number().int().positive().optional(),
});

// Authentication validation
export const authTokenSchema = z.object({
  token: z.string().min(1),
  type: z.enum(['Bearer', 'Basic']).default('Bearer'),
});

export const authContextSchema = z.object({
  isAuthenticated: z.boolean(),
  user: z
    .object({
      id: z.string(),
      username: z.string().optional(),
      permissions: z.array(z.string()).default([]),
    })
    .nullable(),
});

// API Error validation
export const apiErrorSchema = z.object({
  message: z.string().min(1),
  code: z.string().optional(),
  statusCode: z.number().int().min(100).max(599),
  details: z.record(z.string(), z.unknown()).optional(),
  timestamp: z
    .date()
    .optional()
    .default(() => new Date()),
});

// Node-RED API responses validation
export const nodeRedSystemInfoSchema = z.object({
  version: z.string(),
  platform: z.string(),
  arch: z.string(),
  memory: z.object({
    total: z.number(),
    free: z.number(),
    used: z.number(),
  }),
  flows: z.object({
    count: z.number().int().min(0),
    active: z.number().int().min(0),
  }),
  nodes: z.object({
    count: z.number().int().min(0),
    types: z.array(z.string()),
  }),
});

// Search/query validation
export const searchQuerySchema = z.object({
  query: z.string().min(1).max(100),
  category: z.enum(['all', 'contrib', 'dashboard']).default('all'),
  limit: z.number().int().min(1).max(100).default(20),
  offset: z.number().int().min(0).default(0),
});

// File path validation (security-focused)
export const safeFilePathSchema = z
  .string()
  .min(1)
  .max(500)
  .regex(/^[a-zA-Z0-9._\-/\\]+$/, 'Invalid characters in file path')
  .refine(path => !path.includes('..'), 'Path traversal not allowed')
  .refine(path => !path.startsWith('/'), 'Absolute paths not allowed');

// Network address validation
export const networkAddressSchema = z.object({
  host: z.string().min(1).max(253),
  port: z.number().int().min(1).max(65535),
  protocol: z.enum(['http', 'https', 'ws', 'wss']).default('http'),
});

// Validation utility functions
export const validateEnv = (env: Record<string, unknown>) => envSchema.parse(env);

export const validateMcpToolRequest = (request: unknown) => mcpToolRequestSchema.parse(request);

export const validateNodeRedFlow = (flow: unknown) => nodeRedFlowSchema.parse(flow);

export const validateHttpRequest = (request: unknown) => httpRequestSchema.parse(request);

export const validateSseEvent = (event: unknown) => sseEventSchema.parse(event);

// Custom validation error handling
export class ValidationError extends Error {
  constructor(
    message: string,
    public validationErrors: z.ZodError,
    public statusCode = 400
  ) {
    super(message);
    this.name = 'ValidationError';
  }
}

export const createValidationErrorHandler = (schema: z.ZodSchema) => (data: unknown) => {
    try {
      return schema.parse(data);
    } catch (error) {
      if (error instanceof z.ZodError) {
        throw new ValidationError('Input validation failed', error, 400);
      }
      throw error;
    }
  };
