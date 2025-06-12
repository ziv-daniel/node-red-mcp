/**
 * Comprehensive error handling utilities
 */

import { Request, Response, NextFunction } from 'express';
import { ApiResponse, LogEntry, LogLevel } from '../types/mcp-extensions.js';
import { v4 as uuidv4 } from 'uuid';

export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly isOperational: boolean;
  public readonly timestamp: string;
  public readonly requestId?: string;

  constructor(
    message: string,
    statusCode: number = 500,
    code: string = 'INTERNAL_ERROR',
    isOperational: boolean = true
  ) {
    super(message);
    
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = isOperational;
    this.timestamp = new Date().toISOString();
    
    Error.captureStackTrace(this, this.constructor);
  }

  setRequestId(requestId: string): this {
    (this as any).requestId = requestId;
    return this;
  }
}

export class ValidationError extends AppError {
  public readonly field?: string;
  public readonly value?: any;

  constructor(message: string, field?: string, value?: any) {
    super(message, 400, 'VALIDATION_ERROR');
    this.field = field;
    this.value = value;
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string, id?: string) {
    const message = id 
      ? `${resource} with id '${id}' not found`
      : `${resource} not found`;
    super(message, 404, 'NOT_FOUND');
  }
}

export class AuthenticationError extends AppError {
  constructor(message: string = 'Authentication failed') {
    super(message, 401, 'AUTHENTICATION_ERROR');
  }
}

export class AuthorizationError extends AppError {
  constructor(action: string, resource: string = 'resource') {
    super(`Not authorized to ${action} ${resource}`, 403, 'AUTHORIZATION_ERROR');
  }
}

export class NodeRedError extends AppError {
  public readonly nodeRedStatusCode?: number;
  public readonly nodeRedResponse?: any;

  constructor(
    message: string, 
    statusCode: number = 500, 
    nodeRedStatusCode?: number,
    nodeRedResponse?: any
  ) {
    super(message, statusCode, 'NODERED_ERROR');
    this.nodeRedStatusCode = nodeRedStatusCode;
    this.nodeRedResponse = nodeRedResponse;
  }
}

export class SSEError extends AppError {
  public readonly connectionId?: string;

  constructor(message: string, connectionId?: string) {
    super(message, 500, 'SSE_ERROR');
    this.connectionId = connectionId;
  }
}

export class RateLimitError extends AppError {
  public readonly retryAfter: number;

  constructor(retryAfter: number = 60) {
    super('Rate limit exceeded', 429, 'RATE_LIMIT_ERROR');
    this.retryAfter = retryAfter;
  }
}

/**
 * Create standardized error response
 */
export function createErrorResponse<T = never>(
  error: AppError | Error,
  requestId?: string
): ApiResponse<T> {
  const timestamp = new Date().toISOString();
  
  if (error instanceof AppError) {
    return {
      success: false,
      error: {
        code: error.code,
        message: error.message,
        details: process.env.NODE_ENV === 'development' ? {
          stack: error.stack,
          ...(error instanceof NodeRedError && {
            nodeRedStatusCode: error.nodeRedStatusCode,
            nodeRedResponse: error.nodeRedResponse
          }),
          ...(error instanceof ValidationError && {
            field: error.field,
            value: error.value
          }),
          ...(error instanceof SSEError && {
            connectionId: error.connectionId
          })
        } : undefined
      },
      timestamp,
      requestId: requestId || error.requestId
    };
  }

  // Handle unexpected errors
  return {
    success: false,
    error: {
      code: 'INTERNAL_ERROR',
      message: process.env.NODE_ENV === 'development' 
        ? error.message 
        : 'An unexpected error occurred',
      details: process.env.NODE_ENV === 'development' ? {
        stack: error.stack
      } : undefined
    },
    timestamp,
    requestId
  };
}

/**
 * Express error handling middleware
 */
export function errorHandler(
  error: Error,
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const requestId = (req as any).requestId || uuidv4();
  
  // Log the error
  logError(error, {
    requestId,
    method: req.method,
    url: req.url,
    userAgent: req.get('User-Agent'),
    ip: req.ip
  });

  // Handle specific error types
  if (error instanceof AppError) {
    const response = createErrorResponse(error, requestId);
    
    // Add rate limit headers for rate limit errors
    if (error instanceof RateLimitError) {
      res.set('Retry-After', error.retryAfter.toString());
    }
    
    res.status(error.statusCode).json(response);
    return;
  }

  // Handle unexpected errors
  const response = createErrorResponse(error, requestId);
  res.status(500).json(response);
}

/**
 * Async error wrapper for Express handlers
 */
export function asyncHandler<T extends any[]>(
  fn: (req: Request, res: Response, next: NextFunction, ...args: T) => Promise<any>
) {
  return (req: Request, res: Response, next: NextFunction, ...args: T) => {
    Promise.resolve(fn(req, res, next, ...args)).catch(next);
  };
}

/**
 * Handle Node-RED API errors
 */
export function handleNodeRedError(error: any, context: string): never {
  if (error.response) {
    // Axios error with response
    const { status, data } = error.response;
    
    // Check if this is a JSON parse error due to HTML response
    const contentType = error.response.headers['content-type'] || '';
    if (error.message?.includes('Unexpected token') && contentType.includes('text/html')) {
      throw new NodeRedError(
        `Node-RED returned HTML instead of JSON in ${context}. This usually indicates an authentication redirect or configuration issue. Check your Node-RED admin settings and authentication.`,
        502,
        status,
        { originalError: error.message, contentType, responsePreview: typeof data === 'string' ? data.substring(0, 200) : data }
      );
    }
    
    throw new NodeRedError(
      `Node-RED API error in ${context}: ${data?.message || data?.error || 'Unknown error'}`,
      status >= 500 ? 502 : status, // Bad Gateway for server errors
      status,
      data
    );
  } else if (error.request) {
    // Network error
    throw new NodeRedError(
      `Failed to connect to Node-RED in ${context}: ${error.message}`,
      503 // Service Unavailable
    );
  } else if (error.message?.includes('Node-RED returned HTML')) {
    // Our custom validation error
    throw new NodeRedError(
      `${error.message} (Context: ${context})`,
      502 // Bad Gateway
    );
  } else {
    // Other error
    throw new NodeRedError(
      `Error in ${context}: ${error.message}`,
      500
    );
  }
}

/**
 * Validate required fields
 */
export function validateRequired(
  data: Record<string, any>,
  requiredFields: string[]
): void {
  for (const field of requiredFields) {
    if (data[field] === undefined || data[field] === null || data[field] === '') {
      throw new ValidationError(`Field '${field}' is required`, field, data[field]);
    }
  }
}

/**
 * Validate field types
 */
export function validateTypes(
  data: Record<string, any>,
  fieldTypes: Record<string, string>
): void {
  for (const [field, expectedType] of Object.entries(fieldTypes)) {
    if (data[field] !== undefined) {
      const actualType = typeof data[field];
      if (actualType !== expectedType) {
        throw new ValidationError(
          `Field '${field}' must be of type ${expectedType}, got ${actualType}`,
          field,
          data[field]
        );
      }
    }
  }
}

/**
 * Log error with context
 */
export function logError(error: Error, context?: Record<string, any>): void {
  const logEntry: LogEntry = {
    level: 'error',
    message: error.message,
    timestamp: new Date().toISOString(),
    source: 'error-handler',
    error,
    context
  };

  if (process.env.NODE_ENV === 'development') {
    console.error('Error:', {
      ...logEntry,
      stack: error.stack
    });
  } else {
    // In production, use structured logging
    console.error(JSON.stringify(logEntry));
  }
}

/**
 * Create request ID middleware
 */
export function requestIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  const requestId = uuidv4();
  (req as any).requestId = requestId;
  res.set('X-Request-ID', requestId);
  next();
}

/**
 * Sanitize error for client response
 */
export function sanitizeError(error: any): any {
  if (error instanceof AppError) {
    return {
      code: error.code,
      message: error.message,
      statusCode: error.statusCode
    };
  }

  return {
    code: 'INTERNAL_ERROR',
    message: 'An unexpected error occurred',
    statusCode: 500
  };
}

/**
 * Check if error is operational (expected) or programming error
 */
export function isOperationalError(error: Error): boolean {
  if (error instanceof AppError) {
    return error.isOperational;
  }
  return false;
}

/**
 * Safe JSON stringify that handles circular references and errors
 */
export function safeStringify(obj: any): string {
  try {
    return JSON.stringify(obj, (key, value) => {
      if (value instanceof Error) {
        return {
          name: value.name,
          message: value.message,
          stack: value.stack
        };
      }
      return value;
    }, 2);
  } catch (error) {
    return '[Unable to stringify object]';
  }
} 