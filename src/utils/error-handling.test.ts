/**
 * Tests for error handling utilities
 *
 * Comprehensive tests for all error classes, middleware, and validation functions
 */

import { Request, Response, NextFunction } from 'express';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import {
  AppError,
  ValidationError,
  NotFoundError,
  AuthenticationError,
  AuthorizationError,
  NodeRedError,
  SSEError,
  RateLimitError,
  createErrorResponse,
  errorHandler,
  asyncHandler,
  handleNodeRedError,
  validateRequired,
  validateTypes,
  logError,
  requestIdMiddleware,
  sanitizeError,
  isOperationalError,
  safeStringify,
} from './error-handling.js';

describe('Error Classes', () => {
  describe('AppError', () => {
    it('should create error with default values', () => {
      const error = new AppError('Test error');

      expect(error.message).toBe('Test error');
      expect(error.statusCode).toBe(500);
      expect(error.code).toBe('INTERNAL_ERROR');
      expect(error.isOperational).toBe(true);
      expect(error.timestamp).toBeDefined();
      expect(error.name).toBe('AppError');
    });

    it('should create error with custom values', () => {
      const error = new AppError('Custom error', 400, 'CUSTOM_ERROR', false);

      expect(error.statusCode).toBe(400);
      expect(error.code).toBe('CUSTOM_ERROR');
      expect(error.isOperational).toBe(false);
    });

    it('should set request ID', () => {
      const error = new AppError('Test error');
      error.setRequestId('req-123');

      expect(error.requestId).toBe('req-123');
    });

    it('should be chainable', () => {
      const error = new AppError('Test error').setRequestId('req-123');

      expect(error).toBeInstanceOf(AppError);
      expect(error.requestId).toBe('req-123');
    });

    it('should have stack trace', () => {
      const error = new AppError('Test error');

      expect(error.stack).toBeDefined();
      expect(error.stack).toContain('AppError');
    });
  });

  describe('ValidationError', () => {
    it('should create with message only', () => {
      const error = new ValidationError('Invalid input');

      expect(error.message).toBe('Invalid input');
      expect(error.statusCode).toBe(400);
      expect(error.code).toBe('VALIDATION_ERROR');
      expect(error.field).toBeUndefined();
      expect(error.value).toBeUndefined();
    });

    it('should create with field and value', () => {
      const error = new ValidationError('Invalid email', 'email', 'not-an-email');

      expect(error.field).toBe('email');
      expect(error.value).toBe('not-an-email');
    });

    it('should handle undefined field gracefully', () => {
      const error = new ValidationError('Invalid', undefined, 'value');

      expect(error.field).toBeUndefined();
      expect(error.value).toBe('value');
    });
  });

  describe('NotFoundError', () => {
    it('should create error without id', () => {
      const error = new NotFoundError('Flow');

      expect(error.message).toBe('Flow not found');
      expect(error.statusCode).toBe(404);
      expect(error.code).toBe('NOT_FOUND');
    });

    it('should create error with id', () => {
      const error = new NotFoundError('Flow', 'flow-123');

      expect(error.message).toBe("Flow with id 'flow-123' not found");
    });
  });

  describe('AuthenticationError', () => {
    it('should create with default message', () => {
      const error = new AuthenticationError();

      expect(error.message).toBe('Authentication failed');
      expect(error.statusCode).toBe(401);
      expect(error.code).toBe('AUTHENTICATION_ERROR');
    });

    it('should create with custom message', () => {
      const error = new AuthenticationError('Invalid token');

      expect(error.message).toBe('Invalid token');
    });
  });

  describe('AuthorizationError', () => {
    it('should create with action and default resource', () => {
      const error = new AuthorizationError('delete');

      expect(error.message).toBe('Not authorized to delete resource');
      expect(error.statusCode).toBe(403);
      expect(error.code).toBe('AUTHORIZATION_ERROR');
    });

    it('should create with action and custom resource', () => {
      const error = new AuthorizationError('edit', 'flow');

      expect(error.message).toBe('Not authorized to edit flow');
    });
  });

  describe('NodeRedError', () => {
    it('should create with basic parameters', () => {
      const error = new NodeRedError('Connection failed');

      expect(error.message).toBe('Connection failed');
      expect(error.statusCode).toBe(500);
      expect(error.code).toBe('NODERED_ERROR');
      expect(error.nodeRedStatusCode).toBeUndefined();
      expect(error.nodeRedResponse).toBeUndefined();
    });

    it('should create with Node-RED specific details', () => {
      const response = { error: 'not_found', message: 'Flow not found' };
      const error = new NodeRedError('API error', 404, 404, response);

      expect(error.statusCode).toBe(404);
      expect(error.nodeRedStatusCode).toBe(404);
      expect(error.nodeRedResponse).toEqual(response);
    });
  });

  describe('SSEError', () => {
    it('should create without connection ID', () => {
      const error = new SSEError('Connection failed');

      expect(error.message).toBe('Connection failed');
      expect(error.statusCode).toBe(500);
      expect(error.code).toBe('SSE_ERROR');
      expect(error.connectionId).toBeUndefined();
    });

    it('should create with connection ID', () => {
      const error = new SSEError('Connection failed', 'conn-123');

      expect(error.connectionId).toBe('conn-123');
    });
  });

  describe('RateLimitError', () => {
    it('should create with default retry after', () => {
      const error = new RateLimitError();

      expect(error.message).toBe('Rate limit exceeded');
      expect(error.statusCode).toBe(429);
      expect(error.code).toBe('RATE_LIMIT_ERROR');
      expect(error.retryAfter).toBe(60);
    });

    it('should create with custom retry after', () => {
      const error = new RateLimitError(120);

      expect(error.retryAfter).toBe(120);
    });
  });
});

describe('createErrorResponse', () => {
  const originalEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
  });

  it('should create response for AppError', () => {
    const error = new AppError('Test error', 400, 'TEST_ERROR');
    const response = createErrorResponse(error);

    expect(response.success).toBe(false);
    expect(response.error?.code).toBe('TEST_ERROR');
    expect(response.error?.message).toBe('Test error');
    expect(response.timestamp).toBeDefined();
  });

  it('should include details in development mode', () => {
    process.env.NODE_ENV = 'development';
    const error = new AppError('Test error');
    const response = createErrorResponse(error);

    expect(response.error?.details).toBeDefined();
    expect(response.error?.details?.stack).toBeDefined();
  });

  it('should exclude details in production mode', () => {
    process.env.NODE_ENV = 'production';
    const error = new AppError('Test error');
    const response = createErrorResponse(error);

    expect(response.error?.details).toBeUndefined();
  });

  it('should include NodeRedError specific details', () => {
    process.env.NODE_ENV = 'development';
    const error = new NodeRedError('API error', 502, 404, { data: 'test' });
    const response = createErrorResponse(error);

    expect(response.error?.details?.nodeRedStatusCode).toBe(404);
    expect(response.error?.details?.nodeRedResponse).toEqual({ data: 'test' });
  });

  it('should include ValidationError specific details', () => {
    process.env.NODE_ENV = 'development';
    const error = new ValidationError('Invalid field', 'email', 'bad-email');
    const response = createErrorResponse(error);

    expect(response.error?.details?.field).toBe('email');
    expect(response.error?.details?.value).toBe('bad-email');
  });

  it('should include SSEError specific details', () => {
    process.env.NODE_ENV = 'development';
    const error = new SSEError('Connection lost', 'conn-123');
    const response = createErrorResponse(error);

    expect(response.error?.details?.connectionId).toBe('conn-123');
  });

  it('should include request ID', () => {
    const error = new AppError('Test error');
    const response = createErrorResponse(error, 'req-123');

    expect(response.requestId).toBe('req-123');
  });

  it('should use error requestId if available', () => {
    const error = new AppError('Test error').setRequestId('error-req-id');
    const response = createErrorResponse(error);

    expect(response.requestId).toBe('error-req-id');
  });

  it('should handle non-AppError in development', () => {
    process.env.NODE_ENV = 'development';
    const error = new Error('Generic error');
    const response = createErrorResponse(error);

    expect(response.error?.code).toBe('INTERNAL_ERROR');
    expect(response.error?.message).toBe('Generic error');
  });

  it('should hide non-AppError message in production', () => {
    process.env.NODE_ENV = 'production';
    const error = new Error('Sensitive error details');
    const response = createErrorResponse(error);

    expect(response.error?.message).toBe('An unexpected error occurred');
  });
});

describe('errorHandler middleware', () => {
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let mockNext: NextFunction;
  let jsonSpy: ReturnType<typeof vi.fn>;
  let statusSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    jsonSpy = vi.fn();
    statusSpy = vi.fn().mockReturnValue({ json: jsonSpy });

    mockReq = {
      method: 'GET',
      url: '/test',
      get: vi.fn().mockReturnValue('test-agent'),
      ip: '127.0.0.1',
    };

    mockRes = {
      status: statusSpy,
      set: vi.fn(),
      json: jsonSpy,
    } as any;

    mockNext = vi.fn();
  });

  it('should handle AppError', () => {
    const error = new AppError('Test error', 400, 'TEST_ERROR');

    errorHandler(error, mockReq as Request, mockRes as Response, mockNext);

    expect(statusSpy).toHaveBeenCalledWith(400);
    expect(jsonSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: expect.objectContaining({
          code: 'TEST_ERROR',
        }),
      })
    );
  });

  it('should handle RateLimitError with Retry-After header', () => {
    const error = new RateLimitError(120);

    errorHandler(error, mockReq as Request, mockRes as Response, mockNext);

    expect(mockRes.set).toHaveBeenCalledWith('Retry-After', '120');
    expect(statusSpy).toHaveBeenCalledWith(429);
  });

  it('should handle generic Error', () => {
    const error = new Error('Generic error');

    errorHandler(error, mockReq as Request, mockRes as Response, mockNext);

    expect(statusSpy).toHaveBeenCalledWith(500);
  });

  it('should use existing request ID', () => {
    (mockReq as any).requestId = 'existing-req-id';
    const error = new AppError('Test error');

    errorHandler(error, mockReq as Request, mockRes as Response, mockNext);

    expect(jsonSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        requestId: 'existing-req-id',
      })
    );
  });
});

describe('asyncHandler', () => {
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let mockNext: NextFunction;

  beforeEach(() => {
    mockReq = {};
    mockRes = {};
    mockNext = vi.fn();
  });

  it('should call async function and handle success', async () => {
    const asyncFn = vi.fn().mockResolvedValue('success');
    const wrapped = asyncHandler(asyncFn);

    await wrapped(mockReq as Request, mockRes as Response, mockNext);

    expect(asyncFn).toHaveBeenCalledWith(mockReq, mockRes, mockNext);
    expect(mockNext).not.toHaveBeenCalled();
  });

  it('should catch errors and pass to next', async () => {
    const error = new Error('Async error');
    const asyncFn = vi.fn().mockRejectedValue(error);
    const wrapped = asyncHandler(asyncFn);

    await wrapped(mockReq as Request, mockRes as Response, mockNext);

    expect(mockNext).toHaveBeenCalledWith(error);
  });
});

describe('handleNodeRedError', () => {
  it('should handle Axios response error', () => {
    const error = {
      response: {
        status: 404,
        data: { message: 'Not found' },
        headers: { 'content-type': 'application/json' },
      },
    };

    expect(() => handleNodeRedError(error, 'getFlow')).toThrow(NodeRedError);
    expect(() => handleNodeRedError(error, 'getFlow')).toThrow(/getFlow/);
  });

  it('should handle HTML response error', () => {
    const error = {
      response: {
        status: 200,
        data: '<!DOCTYPE html><html>Login</html>',
        headers: { 'content-type': 'text/html' },
      },
      message: 'Unexpected token < in JSON at position 0',
    };

    expect(() => handleNodeRedError(error, 'getFlows')).toThrow(NodeRedError);
    expect(() => handleNodeRedError(error, 'getFlows')).toThrow(/HTML instead of JSON/);
  });

  it('should handle network error (no response)', () => {
    const error = {
      request: {},
      message: 'ECONNREFUSED',
    };

    expect(() => handleNodeRedError(error, 'getFlows')).toThrow(NodeRedError);
    expect(() => handleNodeRedError(error, 'getFlows')).toThrow(/Failed to connect/);
  });

  it('should handle custom HTML validation error', () => {
    const error = {
      message: 'Node-RED returned HTML content instead of JSON',
    };

    expect(() => handleNodeRedError(error, 'getFlows')).toThrow(NodeRedError);
    expect(() => handleNodeRedError(error, 'getFlows')).toThrow(/HTML/);
  });

  it('should handle generic error', () => {
    const error = {
      message: 'Unknown error occurred',
    };

    expect(() => handleNodeRedError(error, 'operation')).toThrow(NodeRedError);
    expect(() => handleNodeRedError(error, 'operation')).toThrow(/Error in operation/);
  });

  it('should use 502 for server errors', () => {
    const error = {
      response: {
        status: 500,
        data: { message: 'Internal server error' },
        headers: {},
      },
    };

    try {
      handleNodeRedError(error, 'test');
    } catch (e) {
      expect(e).toBeInstanceOf(NodeRedError);
      expect((e as NodeRedError).statusCode).toBe(502);
    }
  });
});

describe('validateRequired', () => {
  it('should pass when all required fields are present', () => {
    const data = { name: 'test', value: 123 };

    expect(() => validateRequired(data, ['name', 'value'])).not.toThrow();
  });

  it('should throw ValidationError for undefined field', () => {
    const data = { name: 'test' };

    expect(() => validateRequired(data, ['name', 'value'])).toThrow(ValidationError);
    expect(() => validateRequired(data, ['name', 'value'])).toThrow(/value/);
  });

  it('should throw ValidationError for null field', () => {
    const data = { name: 'test', value: null };

    expect(() => validateRequired(data, ['name', 'value'])).toThrow(ValidationError);
  });

  it('should throw ValidationError for empty string', () => {
    const data = { name: '', value: 123 };

    expect(() => validateRequired(data, ['name', 'value'])).toThrow(ValidationError);
  });

  it('should include field name in error', () => {
    const data = { name: 'test' };

    try {
      validateRequired(data, ['missingField']);
    } catch (e) {
      expect(e).toBeInstanceOf(ValidationError);
      expect((e as ValidationError).field).toBe('missingField');
    }
  });
});

describe('validateTypes', () => {
  it('should pass when all types match', () => {
    const data = { name: 'test', count: 123, enabled: true };
    const types = { name: 'string', count: 'number', enabled: 'boolean' };

    expect(() => validateTypes(data, types)).not.toThrow();
  });

  it('should throw ValidationError for type mismatch', () => {
    const data = { name: 123 };
    const types = { name: 'string' };

    expect(() => validateTypes(data, types)).toThrow(ValidationError);
    expect(() => validateTypes(data, types)).toThrow(/must be of type string/);
  });

  it('should skip undefined fields', () => {
    const data = { name: 'test' };
    const types = { name: 'string', optional: 'number' };

    expect(() => validateTypes(data, types)).not.toThrow();
  });

  it('should include actual type in error', () => {
    const data = { name: 123 };
    const types = { name: 'string' };

    expect(() => validateTypes(data, types)).toThrow(/got number/);
  });
});

describe('logError', () => {
  it('should log error in development mode', () => {
    process.env.NODE_ENV = 'development';
    const error = new Error('Test error');

    // Should not throw
    expect(() => logError(error)).not.toThrow();
  });

  it('should log error with context', () => {
    const error = new Error('Test error');
    const context = { requestId: 'req-123', method: 'GET' };

    expect(() => logError(error, context)).not.toThrow();
  });

  it('should log error in production mode', () => {
    process.env.NODE_ENV = 'production';
    const error = new Error('Test error');

    expect(() => logError(error)).not.toThrow();
  });
});

describe('requestIdMiddleware', () => {
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let mockNext: NextFunction;

  beforeEach(() => {
    mockReq = {};
    mockRes = {
      set: vi.fn(),
    };
    mockNext = vi.fn();
  });

  it('should set request ID on request object', () => {
    requestIdMiddleware(mockReq as Request, mockRes as Response, mockNext);

    expect((mockReq as any).requestId).toBeDefined();
    expect((mockReq as any).requestId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('should set X-Request-ID header on response', () => {
    requestIdMiddleware(mockReq as Request, mockRes as Response, mockNext);

    expect(mockRes.set).toHaveBeenCalledWith(
      'X-Request-ID',
      expect.stringMatching(/^[0-9a-f-]{36}$/)
    );
  });

  it('should call next', () => {
    requestIdMiddleware(mockReq as Request, mockRes as Response, mockNext);

    expect(mockNext).toHaveBeenCalled();
  });
});

describe('sanitizeError', () => {
  it('should sanitize AppError', () => {
    const error = new AppError('Test error', 400, 'TEST_ERROR');
    const sanitized = sanitizeError(error);

    expect(sanitized).toEqual({
      code: 'TEST_ERROR',
      message: 'Test error',
      statusCode: 400,
    });
  });

  it('should hide details for generic Error', () => {
    const error = new Error('Sensitive internal error');
    const sanitized = sanitizeError(error);

    expect(sanitized).toEqual({
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred',
      statusCode: 500,
    });
  });

  it('should handle non-Error objects', () => {
    const sanitized = sanitizeError({ some: 'object' });

    expect(sanitized.code).toBe('INTERNAL_ERROR');
    expect(sanitized.statusCode).toBe(500);
  });
});

describe('isOperationalError', () => {
  it('should return true for operational AppError', () => {
    const error = new AppError('Test', 400, 'TEST', true);

    expect(isOperationalError(error)).toBe(true);
  });

  it('should return false for non-operational AppError', () => {
    const error = new AppError('Test', 500, 'TEST', false);

    expect(isOperationalError(error)).toBe(false);
  });

  it('should return false for generic Error', () => {
    const error = new Error('Generic error');

    expect(isOperationalError(error)).toBe(false);
  });

  it('should return true for ValidationError', () => {
    const error = new ValidationError('Invalid input');

    expect(isOperationalError(error)).toBe(true);
  });
});

describe('safeStringify', () => {
  it('should stringify simple objects', () => {
    const obj = { name: 'test', value: 123 };
    const result = safeStringify(obj);

    expect(result).toBe(JSON.stringify(obj, null, 2));
  });

  it('should handle Error objects', () => {
    const error = new Error('Test error');
    const result = safeStringify({ error });
    const parsed = JSON.parse(result);

    expect(parsed.error).toHaveProperty('name', 'Error');
    expect(parsed.error).toHaveProperty('message', 'Test error');
    expect(parsed.error).toHaveProperty('stack');
  });

  it('should handle circular references gracefully', () => {
    const obj: any = { name: 'test' };
    obj.self = obj;

    const result = safeStringify(obj);

    // Should return placeholder instead of throwing
    expect(result).toBe('[Unable to stringify object]');
  });

  it('should handle null and undefined', () => {
    expect(safeStringify(null)).toBe('null');
    expect(safeStringify(undefined)).toBe(undefined);
  });

  it('should handle arrays', () => {
    const arr = [1, 2, 3, { nested: 'value' }];
    const result = safeStringify(arr);

    expect(JSON.parse(result)).toEqual(arr);
  });
});
