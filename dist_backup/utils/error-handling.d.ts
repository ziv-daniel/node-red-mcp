/**
 * Comprehensive error handling utilities
 */
import { Request, Response, NextFunction } from 'express';
import { ApiResponse } from '../types/mcp-extensions.js';
export declare class AppError extends Error {
    readonly statusCode: number;
    readonly code: string;
    readonly isOperational: boolean;
    readonly timestamp: string;
    readonly requestId?: string;
    constructor(message: string, statusCode?: number, code?: string, isOperational?: boolean);
    setRequestId(requestId: string): this;
}
export declare class ValidationError extends AppError {
    readonly field?: string;
    readonly value?: any;
    constructor(message: string, field?: string, value?: any);
}
export declare class NotFoundError extends AppError {
    constructor(resource: string, id?: string);
}
export declare class AuthenticationError extends AppError {
    constructor(message?: string);
}
export declare class AuthorizationError extends AppError {
    constructor(action: string, resource?: string);
}
export declare class NodeRedError extends AppError {
    readonly nodeRedStatusCode?: number;
    readonly nodeRedResponse?: any;
    constructor(message: string, statusCode?: number, nodeRedStatusCode?: number, nodeRedResponse?: any);
}
export declare class SSEError extends AppError {
    readonly connectionId?: string;
    constructor(message: string, connectionId?: string);
}
export declare class RateLimitError extends AppError {
    readonly retryAfter: number;
    constructor(retryAfter?: number);
}
/**
 * Create standardized error response
 */
export declare function createErrorResponse<T = never>(error: AppError | Error, requestId?: string): ApiResponse<T>;
/**
 * Express error handling middleware
 */
export declare function errorHandler(error: Error, req: Request, res: Response, next: NextFunction): void;
/**
 * Async error wrapper for Express handlers
 */
export declare function asyncHandler<T extends any[]>(fn: (req: Request, res: Response, next: NextFunction, ...args: T) => Promise<any>): (req: Request, res: Response, next: NextFunction, ...args: T) => void;
/**
 * Handle Node-RED API errors
 */
export declare function handleNodeRedError(error: any, context: string): never;
/**
 * Validate required fields
 */
export declare function validateRequired(data: Record<string, any>, requiredFields: string[]): void;
/**
 * Validate field types
 */
export declare function validateTypes(data: Record<string, any>, fieldTypes: Record<string, string>): void;
/**
 * Log error with context
 */
export declare function logError(error: Error, context?: Record<string, any>): void;
/**
 * Create request ID middleware
 */
export declare function requestIdMiddleware(req: Request, res: Response, next: NextFunction): void;
/**
 * Sanitize error for client response
 */
export declare function sanitizeError(error: any): any;
/**
 * Check if error is operational (expected) or programming error
 */
export declare function isOperationalError(error: Error): boolean;
/**
 * Safe JSON stringify that handles circular references and errors
 */
export declare function safeStringify(obj: any): string;
//# sourceMappingURL=error-handling.d.ts.map