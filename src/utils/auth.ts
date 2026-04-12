/**
 * Authentication utilities for JWT and API key management
 */

import { timingSafeEqual } from 'crypto';

import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

import { McpAuthContext, NodeRedToolPermissions } from '../types/mcp-extensions.js';

function getJwtSecret(): string {
  const value = process.env.JWT_SECRET;
  if (!value) {
    throw new Error('Required environment variable JWT_SECRET is not set');
  }
  if (value.length < 32) {
    throw new Error('JWT_SECRET must be at least 32 characters');
  }
  return value;
}

function getApiKey(): string {
  const value = process.env.API_KEY;
  if (!value) {
    throw new Error('Required environment variable API_KEY is not set');
  }
  return value;
}

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
export function generateToken(payload: Omit<AuthPayload, 'iat' | 'exp'>): string {
  return jwt.sign(payload, getJwtSecret(), {
    expiresIn: process.env.JWT_EXPIRES_IN || '24h',
    algorithm: 'HS256',
  } as jwt.SignOptions);
}

/**
 * Verify JWT token and return payload
 */
export function verifyToken(token: string): AuthPayload | null {
  try {
    const decoded = jwt.verify(token, getJwtSecret()) as AuthPayload;
    return decoded;
  } catch {
    return null;
  }
}

/**
 * Extract token from Authorization header
 */
export function extractToken(authHeader: string): string | null {
  if (!authHeader) return null;

  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    return null;
  }

  return parts[1] || null;
}

/**
 * Middleware for JWT authentication
 */
export function authenticateJWT(req: AuthRequest, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    res.status(401).json({ error: 'Authorization header required' });
    return;
  }

  const token = extractToken(authHeader);
  if (!token) {
    res.status(401).json({ error: 'Invalid authorization format' });
    return;
  }

  const payload = verifyToken(token);
  if (!payload) {
    res.status(401).json({ error: 'Invalid or expired token' });
    return;
  }

  req.auth = {
    userId: payload.userId,
    permissions: payload.permissions,
    isAuthenticated: true,
    tokenExpiry: new Date(payload.exp! * 1000),
  };

  next();
}

/**
 * Middleware for API key authentication
 */
export function authenticateAPIKey(req: AuthRequest, res: Response, next: NextFunction): void {
  const apiKey = req.headers['x-api-key'] as string;

  if (!apiKey) {
    res.status(401).json({ error: 'API key required' });
    return;
  }

  const expected = getApiKey();
  let valid = false;
  try {
    const a = Buffer.from(apiKey);
    const b = Buffer.from(expected);
    valid = a.length === b.length && timingSafeEqual(a, b);
  } catch {
    valid = false;
  }

  if (!valid) {
    res.status(401).json({ error: 'Invalid API key' });
    return;
  }

  req.auth = {
    permissions: ['*'],
    isAuthenticated: true,
  };

  next();
}

/**
 * Flexible authentication middleware (JWT or API key)
 */
export function authenticate(req: AuthRequest, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  const apiKey = req.headers['x-api-key'] as string;

  if (apiKey) {
    return authenticateAPIKey(req, res, next);
  }

  if (authHeader) {
    return authenticateJWT(req, res, next);
  }

  res.status(401).json({ error: 'Authentication required' });
}

/**
 * Check if user has specific permission
 */
export function hasPermission(auth: McpAuthContext, permission: string): boolean {
  if (!auth.isAuthenticated) return false;
  if (auth.permissions.includes('*')) return true;
  return auth.permissions.includes(permission);
}

/**
 * Check Node-RED specific permissions
 */
export function getNodeRedPermissions(auth: McpAuthContext): NodeRedToolPermissions {
  return {
    canReadFlows: hasPermission(auth, 'flows:read') || hasPermission(auth, '*'),
    canWriteFlows: hasPermission(auth, 'flows:write') || hasPermission(auth, '*'),
    canDeployFlows: hasPermission(auth, 'flows:deploy') || hasPermission(auth, '*'),
    canManageNodes: hasPermission(auth, 'nodes:manage') || hasPermission(auth, '*'),
    canAccessRuntime: hasPermission(auth, 'runtime:access') || hasPermission(auth, '*'),
    canViewLogs: hasPermission(auth, 'logs:view') || hasPermission(auth, '*'),
    canManageSettings: hasPermission(auth, 'settings:manage') || hasPermission(auth, '*'),
  };
}

/**
 * Authorization middleware for specific permissions
 */
export function requirePermission(permission: string) {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.auth) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    if (!hasPermission(req.auth, permission)) {
      res.status(403).json({
        error: 'Insufficient permissions',
        required: permission,
      });
      return;
    }

    next();
  };
}

/**
 * Create auth context for MCP tools
 */
export function createAuthContext(req: AuthRequest): McpAuthContext {
  return (
    req.auth || {
      permissions: [],
      isAuthenticated: false,
    }
  );
}

/**
 * Validate Node-RED credentials
 */
export function validateNodeRedAuth(): {
  type: 'basic' | 'bearer' | 'none';
  credentials?: { username?: string; password?: string; token?: string };
} {
  const nodeRedUsername = process.env.NODERED_USERNAME;
  const nodeRedPassword = process.env.NODERED_PASSWORD;
  const nodeRedToken = process.env.NODERED_API_TOKEN;

  if (nodeRedToken) {
    return {
      type: 'bearer',
      credentials: { token: nodeRedToken },
    };
  }

  if (nodeRedUsername && nodeRedPassword) {
    return {
      type: 'basic',
      credentials: { username: nodeRedUsername, password: nodeRedPassword },
    };
  }

  return { type: 'none' };
}

/**
 * Generate Node-RED authorization header
 */
export function getNodeRedAuthHeader(): Record<string, string> {
  const authConfig = validateNodeRedAuth();

  switch (authConfig.type) {
    case 'bearer':
      return {
        Authorization: `Bearer ${authConfig.credentials!.token}`,
      };

    case 'basic': {
      const credentials = Buffer.from(
        `${authConfig.credentials!.username}:${authConfig.credentials!.password}`
      ).toString('base64');
      return {
        Authorization: `Basic ${credentials}`,
      };
    }

    default:
      return {};
  }
}

/**
 * Rate limiting by user ID or IP
 */
export function getRateLimitKey(req: Request): string {
  const authReq = req as AuthRequest;
  if (authReq.auth?.userId) {
    return `user:${authReq.auth.userId}`;
  }

  return `ip:${req.ip || req.connection.remoteAddress || 'unknown'}`;
}
