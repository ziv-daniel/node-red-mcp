/**
 * Authentication utilities for JWT and API key management
 */

import jwt from 'jsonwebtoken';
import { Request, Response, NextFunction } from 'express';
import {
  McpAuthContext,
  NodeRedToolPermissions,
} from '../types/mcp-extensions.js';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';
const API_KEY = process.env.API_KEY || 'your-api-key';

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
export function generateToken(
  payload: Omit<AuthPayload, 'iat' | 'exp'>,
): string {
  return jwt.sign(payload, JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '24h',
    algorithm: 'HS256',
  } as jwt.SignOptions);
}

/**
 * Verify JWT token and return payload
 */
export function verifyToken(token: string): AuthPayload | null {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as AuthPayload;
    return decoded;
  } catch (error) {
    console.error('Token verification failed:', error);
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
export function authenticateJWT(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): void {
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
export function authenticateAPIKey(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): void {
  const apiKey = req.headers['x-api-key'] as string;

  if (!apiKey) {
    res.status(401).json({ error: 'API key required' });
    return;
  }

  if (apiKey !== API_KEY) {
    res.status(401).json({ error: 'Invalid API key' });
    return;
  }

  req.auth = {
    permissions: ['*'], // API key has all permissions
    isAuthenticated: true,
  };

  next();
}

/**
 * Flexible authentication middleware (JWT or API key)
 */
export function authenticate(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): void {
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
 * Claude-compatible authentication middleware (flexible authentication)
 */
export function authenticateClaudeCompatible(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): void {
  const isClaudeMode = process.env.CLAUDE_COMPATIBLE_MODE === 'true';
  const authRequired = process.env.CLAUDE_AUTH_REQUIRED !== 'false';
  const acceptAnyToken = process.env.ACCEPT_ANY_BEARER_TOKEN === 'true';
  const debugConnections = process.env.DEBUG_CLAUDE_CONNECTIONS === 'true';

  if (debugConnections) {
    console.log('Claude authentication attempt:', {
      userAgent: req.get('User-Agent'),
      origin: req.get('Origin'),
      authorization: req.headers.authorization ? 'present' : 'missing',
      headers: Object.keys(req.headers),
    });
  }

  // If Claude mode is enabled and auth is not required, allow through
  if (isClaudeMode && !authRequired) {
    req.auth = {
      permissions: ['*'],
      isAuthenticated: true,
      userId: 'claude-user',
    };
    next();
    return;
  }

  const authHeader = req.headers.authorization;
  const apiKey = req.headers['x-api-key'] as string;

  // Try API key first
  if (apiKey) {
    return authenticateAPIKey(req, res, next);
  }

  // Try Bearer token
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7);

    // In Claude compatible mode, accept any non-empty Bearer token
    if (isClaudeMode && acceptAnyToken && token.length > 0) {
      req.auth = {
        permissions: ['*'],
        isAuthenticated: true,
        userId: 'claude-bearer-user',
      };
      next();
      return;
    }

    // Try normal JWT validation
    const payload = verifyToken(token);
    if (payload) {
      req.auth = {
        userId: payload.userId,
        permissions: payload.permissions,
        isAuthenticated: true,
        tokenExpiry: new Date(payload.exp! * 1000),
      };
      next();
      return;
    }
  }

  // If we get here and it's Claude mode with fallback enabled, allow through
  if (isClaudeMode && process.env.AUTH_FALLBACK_ENABLED === 'true') {
    if (debugConnections) {
      console.log('Using Claude authentication fallback');
    }
    req.auth = {
      permissions: ['*'],
      isAuthenticated: true,
      userId: 'claude-fallback-user',
    };
    next();
    return;
  }

  // Authentication failed
  if (debugConnections) {
    console.log('Claude authentication failed:', {
      authHeader: authHeader ? 'present' : 'missing',
      apiKey: apiKey ? 'present' : 'missing',
      claudeMode: isClaudeMode,
      authRequired,
    });
  }

  res.status(401).json({
    error: 'Authentication required',
    hint: 'For Claude integration, ensure CLAUDE_COMPATIBLE_MODE=true and CLAUDE_AUTH_REQUIRED=false for testing',
  });
}

/**
 * Check if user has specific permission
 */
export function hasPermission(
  auth: McpAuthContext,
  permission: string,
): boolean {
  if (!auth.isAuthenticated) return false;
  if (auth.permissions.includes('*')) return true;
  return auth.permissions.includes(permission);
}

/**
 * Check Node-RED specific permissions
 */
export function getNodeRedPermissions(
  auth: McpAuthContext,
): NodeRedToolPermissions {
  return {
    canReadFlows: hasPermission(auth, 'flows:read') || hasPermission(auth, '*'),
    canWriteFlows:
      hasPermission(auth, 'flows:write') || hasPermission(auth, '*'),
    canDeployFlows:
      hasPermission(auth, 'flows:deploy') || hasPermission(auth, '*'),
    canManageNodes:
      hasPermission(auth, 'nodes:manage') || hasPermission(auth, '*'),
    canAccessRuntime:
      hasPermission(auth, 'runtime:access') || hasPermission(auth, '*'),
    canViewLogs: hasPermission(auth, 'logs:view') || hasPermission(auth, '*'),
    canManageSettings:
      hasPermission(auth, 'settings:manage') || hasPermission(auth, '*'),
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
        current: req.auth.permissions,
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
        `${authConfig.credentials!.username}:${authConfig.credentials!.password}`,
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
