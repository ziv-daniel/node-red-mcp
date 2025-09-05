/**
 * Authentication utilities for JWT and API key management
 */
import { Request, Response, NextFunction } from 'express';
import { McpAuthContext, NodeRedToolPermissions } from '../types/mcp-extensions.js';
export interface AuthPayload {
    userId: string;
    permissions: string[];
    iat?: number;
    exp?: number;
}
export interface AuthRequest extends Request {
    auth?: McpAuthContext;
}
/**
 * Generate JWT token for user authentication
 */
export declare function generateToken(payload: Omit<AuthPayload, 'iat' | 'exp'>): string;
/**
 * Verify JWT token and return payload
 */
export declare function verifyToken(token: string): AuthPayload | null;
/**
 * Extract token from Authorization header
 */
export declare function extractToken(authHeader: string): string | null;
/**
 * Middleware for JWT authentication
 */
export declare function authenticateJWT(req: AuthRequest, res: Response, next: NextFunction): void;
/**
 * Middleware for API key authentication
 */
export declare function authenticateAPIKey(req: AuthRequest, res: Response, next: NextFunction): void;
/**
 * Flexible authentication middleware (JWT or API key)
 */
export declare function authenticate(req: AuthRequest, res: Response, next: NextFunction): void;
/**
 * Claude-compatible authentication middleware (flexible authentication)
 */
export declare function authenticateClaudeCompatible(req: AuthRequest, res: Response, next: NextFunction): void;
/**
 * Check if user has specific permission
 */
export declare function hasPermission(auth: McpAuthContext, permission: string): boolean;
/**
 * Check Node-RED specific permissions
 */
export declare function getNodeRedPermissions(auth: McpAuthContext): NodeRedToolPermissions;
/**
 * Authorization middleware for specific permissions
 */
export declare function requirePermission(permission: string): (req: AuthRequest, res: Response, next: NextFunction) => void;
/**
 * Create auth context for MCP tools
 */
export declare function createAuthContext(req: AuthRequest): McpAuthContext;
/**
 * Validate Node-RED credentials
 */
export declare function validateNodeRedAuth(): {
    type: 'basic' | 'bearer' | 'none';
    credentials?: {
        username?: string;
        password?: string;
        token?: string;
    };
};
/**
 * Generate Node-RED authorization header
 */
export declare function getNodeRedAuthHeader(): Record<string, string>;
/**
 * Rate limiting by user ID or IP
 */
export declare function getRateLimitKey(req: Request): string;
//# sourceMappingURL=auth.d.ts.map