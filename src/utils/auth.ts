/**
 * Authentication utilities for JWT and API key management
 */

import { timingSafeEqual } from 'crypto';
import https from 'https';

import axios from 'axios';
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
  let valid: boolean;
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
 * Middleware for HTTP Basic authentication (MCP_USERNAME / MCP_PASSWORD env vars)
 */
export function authenticateBasic(req: AuthRequest, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith('Basic ')) {
    res.status(401).json({ error: 'Basic authentication required' });
    return;
  }

  const decoded = Buffer.from(authHeader.slice(6), 'base64').toString();
  const colonIndex = decoded.indexOf(':');
  if (colonIndex === -1) {
    res.status(401).json({ error: 'Invalid Basic auth format' });
    return;
  }

  const username = decoded.slice(0, colonIndex);
  const password = decoded.slice(colonIndex + 1);

  const expectedUsername = process.env.MCP_USERNAME;
  const expectedPassword = process.env.MCP_PASSWORD;

  if (!expectedUsername || !expectedPassword) {
    res.status(401).json({ error: 'Basic auth not configured' });
    return;
  }

  let valid: boolean;
  try {
    const u = Buffer.from(username);
    const eu = Buffer.from(expectedUsername);
    const p = Buffer.from(password);
    const ep = Buffer.from(expectedPassword);
    valid =
      u.length === eu.length &&
      p.length === ep.length &&
      timingSafeEqual(u, eu) &&
      timingSafeEqual(p, ep);
  } catch {
    valid = false;
  }

  if (!valid) {
    res.status(401).json({ error: 'Invalid credentials' });
    return;
  }

  req.auth = {
    userId: username,
    permissions: ['*'],
    isAuthenticated: true,
  };

  next();
}

/**
 * Flexible authentication middleware (JWT, API key, or Basic)
 */
export function authenticate(req: AuthRequest, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  const apiKey = req.headers['x-api-key'] as string;

  if (apiKey) {
    return authenticateAPIKey(req, res, next);
  }

  if (authHeader?.startsWith('Basic ')) {
    return authenticateBasic(req, res, next);
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

export function getTlsRejectUnauthorized(): boolean {
  return process.env.NODERED_TLS_REJECT_UNAUTHORIZED !== 'false';
}

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

interface CachedNodeRedToken {
  accessToken: string;
  expiresAt: number; // ms epoch
}

let cachedNodeRedToken: CachedNodeRedToken | null = null;
let nodeRedTokenFetch: Promise<CachedNodeRedToken> | null = null;

async function fetchNodeRedToken(username: string, password: string): Promise<CachedNodeRedToken> {
  const baseURL = (process.env.NODERED_URL || 'http://localhost:1880').replace(/\/+$/, '');
  const response = await axios.post(
    `${baseURL}/auth/token`,
    { client_id: 'node-red-admin', grant_type: 'password', scope: '*', username, password },
    {
      timeout: parseInt(process.env.NODERED_TIMEOUT || '5000'),
      httpsAgent: new https.Agent({ rejectUnauthorized: getTlsRejectUnauthorized() }),
    }
  );
  const { access_token, expires_in } = response.data;
  const rawTtlMs = (Number(expires_in) || 604800) * 1000;
  // 60s safety buffer so we refresh slightly before Node-RED actually expires
  // it, but never below a 5s floor — a very short-lived expires_in would
  // otherwise make ttlMs negative and force a re-exchange on every request.
  const ttlMs = Math.max(rawTtlMs - 60_000, 5_000);
  return { accessToken: access_token, expiresAt: Date.now() + ttlMs };
}

/**
 * When true, NODERED_USERNAME/NODERED_PASSWORD are exchanged for a Bearer
 * token via Node-RED's own /auth/token endpoint — i.e. Node-RED's adminAuth
 * is enabled and is the thing actually checking these credentials.
 *
 * When false (default), those credentials are sent as a static HTTP Basic
 * header on every request instead, via getNodeRedAuthHeader(). That's for
 * deployments where NODERED_USERNAME/PASSWORD aren't Node-RED's own adminAuth
 * at all, but credentials for a reverse proxy (nginx, Traefik, ...) sitting
 * in front of the whole instance and Basic-auth-gating every request
 * including the token endpoint itself — for that setup, doing the exchange
 * would 401 immediately at the proxy, before ever reaching Node-RED.
 */
export function isNodeRedAdminAuthEnabled(): boolean {
  return process.env.NODERED_ADMIN_AUTH_ENABLED === 'true';
}

/**
 * Resolve a Bearer token for Node-RED, or undefined if none is available
 * (basic mode with the exchange not opted into, or no credentials at all).
 * Shared by resolveNodeRedAuthHeader and resolveNodeRedAuthToken so there's
 * one cache and one exchange in flight at a time.
 */
async function resolveBearerToken(forceRefresh: boolean): Promise<string | undefined> {
  const authConfig = validateNodeRedAuth();

  if (authConfig.type === 'bearer') {
    return authConfig.credentials!.token;
  }

  if (authConfig.type !== 'basic' || !isNodeRedAdminAuthEnabled()) {
    return undefined;
  }

  if (forceRefresh) {
    cachedNodeRedToken = null;
  }

  if (cachedNodeRedToken && Date.now() < cachedNodeRedToken.expiresAt) {
    return cachedNodeRedToken.accessToken;
  }

  if (!nodeRedTokenFetch) {
    const { username, password } = authConfig.credentials!;
    nodeRedTokenFetch = fetchNodeRedToken(username!, password!).finally(() => {
      nodeRedTokenFetch = null;
    });
  }

  cachedNodeRedToken = await nodeRedTokenFetch;
  return cachedNodeRedToken.accessToken;
}

/**
 * Resolve a usable Authorization header for Node-RED's HTTP admin API.
 *
 * Bearer mode (NODERED_API_TOKEN) always uses that token directly. Basic mode
 * (NODERED_USERNAME/PASSWORD) uses a Bearer token from the /auth/token
 * exchange only when isNodeRedAdminAuthEnabled() is true; otherwise it falls
 * back to a static HTTP Basic header via getNodeRedAuthHeader() (see that
 * function's caveat: Node-RED's own admin API does not accept Basic auth, so
 * this fallback path is only correct when the credentials are actually meant
 * for something in front of Node-RED, not Node-RED's own adminAuth).
 */
export async function resolveNodeRedAuthHeader(
  forceRefresh = false
): Promise<Record<string, string>> {
  const token = await resolveBearerToken(forceRefresh);
  return token ? { Authorization: `Bearer ${token}` } : getNodeRedAuthHeader();
}

/**
 * Resolve a bare Bearer token string (no "Authorization"/"Bearer " wrapping),
 * for callers that need to authenticate over a channel other than an HTTP
 * header — e.g. Node-RED's /comms WebSocket, which authenticates via an
 * in-band `{ auth: "<token>" }` message, not connection headers. Returns
 * undefined when there's no token to send (basic mode with the exchange not
 * opted into, or no credentials at all) — those cases have nothing to
 * authenticate the WebSocket with, whatever this server does have.
 */
export async function resolveNodeRedAuthToken(forceRefresh = false): Promise<string | undefined> {
  return resolveBearerToken(forceRefresh);
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
