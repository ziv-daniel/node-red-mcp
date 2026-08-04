/**
 * Tests for authentication utilities
 */

import type { Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { describe, it, expect, beforeEach, vi } from 'vitest';

import type { McpAuthContext } from '../types/mcp-extensions.js';

import {
  generateToken,
  verifyToken,
  extractToken,
  authenticateJWT,
  authenticateAPIKey,
  authenticate,
  hasPermission,
  getNodeRedPermissions,
  requirePermission,
  createAuthContext,
  validateNodeRedAuth,
  getNodeRedAuthHeader,
  getRateLimitKey,
  type AuthPayload,
  type AuthRequest,
} from './auth.js';

vi.mock('axios', () => ({
  default: {
    post: vi.fn(),
    isAxiosError: vi.fn(() => false),
  },
}));

describe('Auth Utils', () => {
  const mockSecret = 'test-secret-key-minimum-32-chars-xxxx';
  const mockPayload: Omit<AuthPayload, 'iat' | 'exp'> = {
    userId: 'user123',
    permissions: ['read', 'write'],
  };

  beforeEach(() => {
    // Set up environment variable for tests
    process.env.JWT_SECRET = mockSecret;
  });

  describe('generateToken', () => {
    it('should generate a valid JWT token', () => {
      const token = generateToken(mockPayload);

      expect(token).toBeDefined();
      expect(typeof token).toBe('string');
      expect(token.split('.')).toHaveLength(3); // JWT has 3 parts
    });

    it('should generate different tokens for different payloads', () => {
      const token1 = generateToken({ userId: 'user1', permissions: ['read'] });
      const token2 = generateToken({ userId: 'user2', permissions: ['read'] });

      expect(token1).not.toBe(token2);
    });

    it('should include expiration time in token', () => {
      const token = generateToken(mockPayload);
      const decoded = jwt.decode(token) as any;

      expect(decoded).toHaveProperty('exp');
      expect(decoded.exp).toBeGreaterThan(Date.now() / 1000);
    });
  });

  describe('verifyToken', () => {
    it('should verify a valid token', () => {
      const token = generateToken(mockPayload);
      const result = verifyToken(token);

      expect(result).not.toBeNull();
      expect(result).toHaveProperty('userId', mockPayload.userId);
      expect(result).toHaveProperty('permissions');
      expect(result?.permissions).toEqual(mockPayload.permissions);
    });

    it('should reject an invalid token', () => {
      const result = verifyToken('invalid.token.here');

      expect(result).toBeNull();
    });

    it('should reject an empty token', () => {
      const result = verifyToken('');

      expect(result).toBeNull();
    });

    it('should handle expired tokens', () => {
      // Create a token that expires immediately
      const expiredToken = jwt.sign(mockPayload, mockSecret, { expiresIn: '-1s' });
      const result = verifyToken(expiredToken);

      expect(result).toBeNull();
    });
  });

  describe('extractToken', () => {
    it('should extract token from Bearer authorization header', () => {
      const token = 'sample.jwt.token';
      const authHeader = `Bearer ${token}`;
      const result = extractToken(authHeader);

      expect(result).toBe(token);
    });

    it('should return null for invalid format', () => {
      const result = extractToken('InvalidFormat token');

      expect(result).toBeNull();
    });

    it('should return null for missing token', () => {
      const result = extractToken('Bearer ');

      expect(result).toBeNull();
    });

    it('should return null for empty header', () => {
      const result = extractToken('');

      expect(result).toBeNull();
    });
  });
});

describe('Auth Utils Edge Cases', () => {
  it('should throw when JWT_SECRET is missing', () => {
    const originalSecret = process.env.JWT_SECRET;
    delete process.env.JWT_SECRET;

    // Should throw — no fallback secret
    expect(() => generateToken({ userId: 'test', permissions: [] })).toThrow(
      'JWT_SECRET is not set'
    );

    // Restore environment variable
    process.env.JWT_SECRET = originalSecret;
  });

  it('should handle malformed JWT tokens', () => {
    const malformedTokens = ['not.a.jwt', 'too.few.parts', 'too.many.parts.here.invalid', ''];

    malformedTokens.forEach(token => {
      const result = verifyToken(token);
      expect(result).toBeNull();
    });
  });

  it('should handle token signed with different secret', () => {
    const differentSecret = 'different-secret';
    const token = jwt.sign({ userId: 'test', permissions: [] }, differentSecret);

    const result = verifyToken(token);
    expect(result).toBeNull();
  });
});

// Mock express objects helper
function createMockReqRes(): {
  req: AuthRequest;
  res: Partial<Response>;
  next: NextFunction;
  statusCode: number | null;
  jsonData: any;
} {
  let statusCode: number | null = null;
  let jsonData: any = null;

  const req: AuthRequest = {
    headers: {},
    auth: undefined,
    ip: '127.0.0.1',
    connection: { remoteAddress: '127.0.0.1' },
  } as any;

  const res: Partial<Response> = {
    status: ((code: number) => {
      statusCode = code;
      return res;
    }) as any,
    json: ((data: any) => {
      jsonData = data;
      return res;
    }) as any,
  };

  const next: NextFunction = () => {};

  return { req, res, next, statusCode: null, jsonData: null };
}

describe('JWT Authentication Middleware', () => {
  const mockSecret = 'test-secret-key-minimum-32-chars-xxxx';

  beforeEach(() => {
    process.env.JWT_SECRET = mockSecret;
  });

  describe('authenticateJWT', () => {
    it('should reject request without authorization header', () => {
      const { req, res, next } = createMockReqRes();
      let statusCode: number | null = null;
      let jsonData: any = null;

      (res.status as any) = (code: number) => {
        statusCode = code;
        return res;
      };
      (res.json as any) = (data: any) => {
        jsonData = data;
        return res;
      };

      authenticateJWT(req, res as Response, next);

      expect(statusCode).toBe(401);
      expect(jsonData).toHaveProperty('error', 'Authorization header required');
    });

    it('should reject request with invalid authorization format', () => {
      const { req, res, next } = createMockReqRes();
      let statusCode: number | null = null;
      let jsonData: any = null;

      req.headers.authorization = 'Basic token';
      (res.status as any) = (code: number) => {
        statusCode = code;
        return res;
      };
      (res.json as any) = (data: any) => {
        jsonData = data;
        return res;
      };

      authenticateJWT(req, res as Response, next);

      expect(statusCode).toBe(401);
      expect(jsonData).toHaveProperty('error', 'Invalid authorization format');
    });

    it('should reject request with invalid token', () => {
      const { req, res, next } = createMockReqRes();
      let statusCode: number | null = null;
      let jsonData: any = null;

      req.headers.authorization = 'Bearer invalid.token.here';
      (res.status as any) = (code: number) => {
        statusCode = code;
        return res;
      };
      (res.json as any) = (data: any) => {
        jsonData = data;
        return res;
      };

      authenticateJWT(req, res as Response, next);

      expect(statusCode).toBe(401);
      expect(jsonData).toHaveProperty('error', 'Invalid or expired token');
    });

    it('should accept request with valid token', () => {
      const { req, res, next } = createMockReqRes();
      let nextCalled = false;

      const token = generateToken({ userId: 'user123', permissions: ['read'] });
      req.headers.authorization = `Bearer ${token}`;

      authenticateJWT(req, res as Response, () => {
        nextCalled = true;
      });

      expect(nextCalled).toBe(true);
      expect(req.auth).toBeDefined();
      expect(req.auth?.userId).toBe('user123');
      expect(req.auth?.isAuthenticated).toBe(true);
    });
  });
});

describe('API Key Authentication Middleware', () => {
  const mockApiKey = 'test-api-key-for-unit-tests';

  beforeEach(() => {
    process.env.API_KEY = mockApiKey;
  });

  describe('authenticateAPIKey', () => {
    it('should reject request without API key', () => {
      const { req, res, next } = createMockReqRes();
      let statusCode: number | null = null;
      let jsonData: any = null;

      (res.status as any) = (code: number) => {
        statusCode = code;
        return res;
      };
      (res.json as any) = (data: any) => {
        jsonData = data;
        return res;
      };

      authenticateAPIKey(req, res as Response, next);

      expect(statusCode).toBe(401);
      expect(jsonData).toHaveProperty('error', 'API key required');
    });

    it('should reject request with invalid API key', () => {
      const { req, res, next } = createMockReqRes();
      let statusCode: number | null = null;
      let jsonData: any = null;

      req.headers['x-api-key'] = 'wrong-key';
      (res.status as any) = (code: number) => {
        statusCode = code;
        return res;
      };
      (res.json as any) = (data: any) => {
        jsonData = data;
        return res;
      };

      authenticateAPIKey(req, res as Response, next);

      expect(statusCode).toBe(401);
      expect(jsonData).toHaveProperty('error', 'Invalid API key');
    });

    it('should accept request with valid API key', () => {
      const { req, res, next } = createMockReqRes();
      let nextCalled = false;

      req.headers['x-api-key'] = mockApiKey;

      authenticateAPIKey(req, res as Response, () => {
        nextCalled = true;
      });

      expect(nextCalled).toBe(true);
      expect(req.auth).toBeDefined();
      expect(req.auth?.permissions).toContain('*');
      expect(req.auth?.isAuthenticated).toBe(true);
    });
  });
});

describe('Flexible Authentication Middleware', () => {
  const mockSecret = 'test-secret-key-minimum-32-chars-xxxx';
  const mockApiKey = 'test-api-key-for-unit-tests';

  beforeEach(() => {
    process.env.JWT_SECRET = mockSecret;
    process.env.API_KEY = mockApiKey;
  });

  describe('authenticate', () => {
    it('should use API key when provided', () => {
      const { req, res, next } = createMockReqRes();
      let nextCalled = false;

      req.headers['x-api-key'] = mockApiKey;

      authenticate(req, res as Response, () => {
        nextCalled = true;
      });

      expect(nextCalled).toBe(true);
      expect(req.auth?.isAuthenticated).toBe(true);
    });

    it('should use JWT when API key not provided', () => {
      const { req, res, next } = createMockReqRes();
      let nextCalled = false;

      const token = generateToken({ userId: 'user123', permissions: ['read'] });
      req.headers.authorization = `Bearer ${token}`;

      authenticate(req, res as Response, () => {
        nextCalled = true;
      });

      expect(nextCalled).toBe(true);
      expect(req.auth?.userId).toBe('user123');
    });

    it('should reject when no credentials provided', () => {
      const { req, res, next } = createMockReqRes();
      let statusCode: number | null = null;
      let jsonData: any = null;

      (res.status as any) = (code: number) => {
        statusCode = code;
        return res;
      };
      (res.json as any) = (data: any) => {
        jsonData = data;
        return res;
      };

      authenticate(req, res as Response, next);

      expect(statusCode).toBe(401);
      expect(jsonData).toHaveProperty('error', 'Authentication required');
    });
  });
});

describe('Permission Utilities', () => {
  describe('hasPermission', () => {
    it('should return false when not authenticated', () => {
      const auth: McpAuthContext = {
        permissions: ['read'],
        isAuthenticated: false,
      };

      expect(hasPermission(auth, 'read')).toBe(false);
    });

    it('should return true for wildcard permission', () => {
      const auth: McpAuthContext = {
        permissions: ['*'],
        isAuthenticated: true,
      };

      expect(hasPermission(auth, 'any-permission')).toBe(true);
    });

    it('should return true for matching permission', () => {
      const auth: McpAuthContext = {
        permissions: ['read', 'write'],
        isAuthenticated: true,
      };

      expect(hasPermission(auth, 'read')).toBe(true);
      expect(hasPermission(auth, 'write')).toBe(true);
    });

    it('should return false for missing permission', () => {
      const auth: McpAuthContext = {
        permissions: ['read'],
        isAuthenticated: true,
      };

      expect(hasPermission(auth, 'write')).toBe(false);
    });
  });

  describe('getNodeRedPermissions', () => {
    it('should return all permissions for wildcard', () => {
      const auth: McpAuthContext = {
        permissions: ['*'],
        isAuthenticated: true,
      };

      const perms = getNodeRedPermissions(auth);

      expect(perms.canReadFlows).toBe(true);
      expect(perms.canWriteFlows).toBe(true);
      expect(perms.canDeployFlows).toBe(true);
      expect(perms.canManageNodes).toBe(true);
      expect(perms.canAccessRuntime).toBe(true);
      expect(perms.canViewLogs).toBe(true);
      expect(perms.canManageSettings).toBe(true);
    });

    it('should return specific permissions', () => {
      const auth: McpAuthContext = {
        permissions: ['flows:read', 'logs:view'],
        isAuthenticated: true,
      };

      const perms = getNodeRedPermissions(auth);

      expect(perms.canReadFlows).toBe(true);
      expect(perms.canWriteFlows).toBe(false);
      expect(perms.canViewLogs).toBe(true);
      expect(perms.canManageSettings).toBe(false);
    });
  });

  describe('requirePermission', () => {
    it('should reject when not authenticated', () => {
      const { req, res, next } = createMockReqRes();
      let statusCode: number | null = null;

      (res.status as any) = (code: number) => {
        statusCode = code;
        return res;
      };
      (res.json as any) = () => res;

      const middleware = requirePermission('read');
      middleware(req, res as Response, next);

      expect(statusCode).toBe(401);
    });

    it('should reject when permission not found', () => {
      const { req, res, next } = createMockReqRes();
      let statusCode: number | null = null;
      let jsonData: any = null;

      req.auth = {
        permissions: ['write'],
        isAuthenticated: true,
      };
      (res.status as any) = (code: number) => {
        statusCode = code;
        return res;
      };
      (res.json as any) = (data: any) => {
        jsonData = data;
        return res;
      };

      const middleware = requirePermission('read');
      middleware(req, res as Response, next);

      expect(statusCode).toBe(403);
      expect(jsonData).toHaveProperty('required', 'read');
    });

    it('should allow when permission found', () => {
      const { req, res, next } = createMockReqRes();
      let nextCalled = false;

      req.auth = {
        permissions: ['read'],
        isAuthenticated: true,
      };

      const middleware = requirePermission('read');
      middleware(req, res as Response, () => {
        nextCalled = true;
      });

      expect(nextCalled).toBe(true);
    });
  });
});

describe('Auth Context Utilities', () => {
  describe('createAuthContext', () => {
    it('should return request auth if present', () => {
      const { req, res, next } = createMockReqRes();
      req.auth = {
        userId: 'user123',
        permissions: ['read'],
        isAuthenticated: true,
      };

      const context = createAuthContext(req);

      expect(context.userId).toBe('user123');
      expect(context.isAuthenticated).toBe(true);
    });

    it('should return default context if no auth', () => {
      const { req, res, next } = createMockReqRes();

      const context = createAuthContext(req);

      expect(context.permissions).toEqual([]);
      expect(context.isAuthenticated).toBe(false);
    });
  });
});

describe('Node-RED Auth Utilities', () => {
  describe('validateNodeRedAuth', () => {
    beforeEach(() => {
      delete process.env.NODERED_USERNAME;
      delete process.env.NODERED_PASSWORD;
      delete process.env.NODERED_API_TOKEN;
    });

    it('should return bearer type when token is set', () => {
      process.env.NODERED_API_TOKEN = 'test-token';

      const result = validateNodeRedAuth();

      expect(result.type).toBe('bearer');
      expect(result.credentials?.token).toBe('test-token');
    });

    it('should return basic type when username and password are set', () => {
      process.env.NODERED_USERNAME = 'admin';
      process.env.NODERED_PASSWORD = 'password';

      const result = validateNodeRedAuth();

      expect(result.type).toBe('basic');
      expect(result.credentials?.username).toBe('admin');
      expect(result.credentials?.password).toBe('password');
    });

    it('should return none type when no credentials are set', () => {
      const result = validateNodeRedAuth();

      expect(result.type).toBe('none');
    });
  });

  describe('getNodeRedAuthHeader', () => {
    beforeEach(() => {
      delete process.env.NODERED_USERNAME;
      delete process.env.NODERED_PASSWORD;
      delete process.env.NODERED_API_TOKEN;
    });

    it('should return bearer header when token is set', () => {
      process.env.NODERED_API_TOKEN = 'test-token';

      const header = getNodeRedAuthHeader();

      expect(header.Authorization).toBe('Bearer test-token');
    });

    it('should return basic header when username and password are set', () => {
      process.env.NODERED_USERNAME = 'admin';
      process.env.NODERED_PASSWORD = 'password';

      const header = getNodeRedAuthHeader();

      expect(header.Authorization).toContain('Basic ');
      // Decode and verify
      const encoded = header.Authorization!.replace('Basic ', '');
      const decoded = Buffer.from(encoded, 'base64').toString();
      expect(decoded).toBe('admin:password');
    });

    it('should return empty object when no credentials are set', () => {
      const header = getNodeRedAuthHeader();

      expect(header).toEqual({});
    });
  });
});

describe('Rate Limiting Utilities', () => {
  describe('getRateLimitKey', () => {
    it('should return user key when authenticated', () => {
      const { req } = createMockReqRes();
      req.auth = {
        userId: 'user123',
        permissions: [],
        isAuthenticated: true,
      };

      const key = getRateLimitKey(req as any);

      expect(key).toBe('user:user123');
    });

    it('should return IP key when not authenticated', () => {
      const { req } = createMockReqRes();
      (req as any).ip = '192.168.1.1';

      const key = getRateLimitKey(req as any);

      expect(key).toBe('ip:192.168.1.1');
    });

    it('should fallback to connection remoteAddress', () => {
      const { req } = createMockReqRes();
      (req as any).ip = undefined;
      req.connection = { remoteAddress: '10.0.0.1' } as any;

      const key = getRateLimitKey(req as any);

      expect(key).toBe('ip:10.0.0.1');
    });

    it('should return unknown for missing IP', () => {
      const { req } = createMockReqRes();
      (req as any).ip = undefined;
      req.connection = {} as any;

      const key = getRateLimitKey(req as any);

      expect(key).toBe('ip:unknown');
    });
  });
});

describe('resolveNodeRedAuthHeader', () => {
  // Each test re-imports the module fresh (via resetModules) so the
  // in-memory token cache doesn't leak between tests.
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    delete process.env.NODERED_USERNAME;
    delete process.env.NODERED_PASSWORD;
    delete process.env.NODERED_API_TOKEN;
    delete process.env.NODERED_ADMIN_AUTH_ENABLED;
    process.env.NODERED_URL = 'http://localhost:1880';
  });

  it('passes NODERED_API_TOKEN through unchanged without hitting the network', async () => {
    process.env.NODERED_API_TOKEN = 'static-token';
    const axios = (await import('axios')).default;
    const { resolveNodeRedAuthHeader } = await import('./auth.js');

    const header = await resolveNodeRedAuthHeader();

    expect(header).toEqual({ Authorization: 'Bearer static-token' });
    expect(axios.post).not.toHaveBeenCalled();
  });

  it('exchanges username/password for a bearer token and caches it', async () => {
    process.env.NODERED_USERNAME = 'admin';
    process.env.NODERED_PASSWORD = 'secret';
    process.env.NODERED_ADMIN_AUTH_ENABLED = 'true';
    const axios = (await import('axios')).default;
    vi.mocked(axios.post).mockResolvedValue({
      data: { access_token: 'tok-1', expires_in: 3600 },
    });
    const { resolveNodeRedAuthHeader } = await import('./auth.js');

    const first = await resolveNodeRedAuthHeader();
    const second = await resolveNodeRedAuthHeader();

    expect(first).toEqual({ Authorization: 'Bearer tok-1' });
    expect(second).toEqual({ Authorization: 'Bearer tok-1' });
    expect(axios.post).toHaveBeenCalledTimes(1);
    expect(axios.post).toHaveBeenCalledWith(
      'http://localhost:1880/auth/token',
      expect.objectContaining({ grant_type: 'password', username: 'admin', password: 'secret' }),
      expect.anything()
    );
  });

  it('strips a trailing slash from NODERED_URL before building the token endpoint', async () => {
    process.env.NODERED_USERNAME = 'admin';
    process.env.NODERED_PASSWORD = 'secret';
    process.env.NODERED_ADMIN_AUTH_ENABLED = 'true';
    process.env.NODERED_URL = 'http://localhost:1880/';
    const axios = (await import('axios')).default;
    vi.mocked(axios.post).mockResolvedValue({
      data: { access_token: 'tok-1', expires_in: 3600 },
    });
    const { resolveNodeRedAuthHeader } = await import('./auth.js');

    await resolveNodeRedAuthHeader();

    expect(axios.post).toHaveBeenCalledWith(
      'http://localhost:1880/auth/token',
      expect.anything(),
      expect.anything()
    );
  });

  it('clamps the cache TTL to a floor instead of going negative for a short-lived token', async () => {
    process.env.NODERED_USERNAME = 'admin';
    process.env.NODERED_PASSWORD = 'secret';
    process.env.NODERED_ADMIN_AUTH_ENABLED = 'true';
    const axios = (await import('axios')).default;
    // expires_in shorter than the 60s safety buffer would otherwise make
    // the computed expiry land in the past, forcing a re-exchange on every
    // single call instead of caching at all.
    vi.mocked(axios.post).mockResolvedValue({
      data: { access_token: 'tok-1', expires_in: 10 },
    });
    const { resolveNodeRedAuthHeader } = await import('./auth.js');

    await resolveNodeRedAuthHeader();
    await resolveNodeRedAuthHeader();

    expect(axios.post).toHaveBeenCalledTimes(1);
  });

  it('forceRefresh bypasses the cache and re-exchanges credentials', async () => {
    process.env.NODERED_USERNAME = 'admin';
    process.env.NODERED_PASSWORD = 'secret';
    process.env.NODERED_ADMIN_AUTH_ENABLED = 'true';
    const axios = (await import('axios')).default;
    vi.mocked(axios.post)
      .mockResolvedValueOnce({ data: { access_token: 'tok-1', expires_in: 3600 } })
      .mockResolvedValueOnce({ data: { access_token: 'tok-2', expires_in: 3600 } });
    const { resolveNodeRedAuthHeader } = await import('./auth.js');

    await resolveNodeRedAuthHeader();
    const refreshed = await resolveNodeRedAuthHeader(true);

    expect(refreshed).toEqual({ Authorization: 'Bearer tok-2' });
    expect(axios.post).toHaveBeenCalledTimes(2);
  });

  it('dedupes concurrent calls into a single token exchange', async () => {
    process.env.NODERED_USERNAME = 'admin';
    process.env.NODERED_PASSWORD = 'secret';
    process.env.NODERED_ADMIN_AUTH_ENABLED = 'true';
    const axios = (await import('axios')).default;
    let resolvePost!: (value: { data: { access_token: string; expires_in: number } }) => void;
    vi.mocked(axios.post).mockReturnValue(
      new Promise(resolve => {
        resolvePost = resolve;
      })
    );
    const { resolveNodeRedAuthHeader } = await import('./auth.js');

    const call1 = resolveNodeRedAuthHeader();
    const call2 = resolveNodeRedAuthHeader();
    resolvePost({ data: { access_token: 'tok-1', expires_in: 3600 } });

    const [r1, r2] = await Promise.all([call1, call2]);

    expect(r1).toEqual({ Authorization: 'Bearer tok-1' });
    expect(r2).toEqual({ Authorization: 'Bearer tok-1' });
    expect(axios.post).toHaveBeenCalledTimes(1);
  });

  it('falls back to a static Basic header when the admin-auth gate is off (default)', async () => {
    process.env.NODERED_USERNAME = 'admin';
    process.env.NODERED_PASSWORD = 'secret';
    // NODERED_ADMIN_AUTH_ENABLED deliberately left unset.
    const axios = (await import('axios')).default;
    const { resolveNodeRedAuthHeader } = await import('./auth.js');

    const header = await resolveNodeRedAuthHeader();

    expect(header.Authorization).toBe(`Basic ${Buffer.from('admin:secret').toString('base64')}`);
    expect(axios.post).not.toHaveBeenCalled();
  });

  it('falls back to a static Basic header when the gate is literally "false"', async () => {
    process.env.NODERED_USERNAME = 'admin';
    process.env.NODERED_PASSWORD = 'secret';
    process.env.NODERED_ADMIN_AUTH_ENABLED = 'false';
    const axios = (await import('axios')).default;
    const { resolveNodeRedAuthHeader } = await import('./auth.js');

    const header = await resolveNodeRedAuthHeader();

    expect(header.Authorization).toBe(`Basic ${Buffer.from('admin:secret').toString('base64')}`);
    expect(axios.post).not.toHaveBeenCalled();
  });

  it('bearer mode (NODERED_API_TOKEN) is unaffected by the gate being off', async () => {
    process.env.NODERED_API_TOKEN = 'static-token';
    const axios = (await import('axios')).default;
    const { resolveNodeRedAuthHeader } = await import('./auth.js');

    const header = await resolveNodeRedAuthHeader();

    expect(header).toEqual({ Authorization: 'Bearer static-token' });
    expect(axios.post).not.toHaveBeenCalled();
  });
});

describe('isNodeRedAdminAuthEnabled', () => {
  beforeEach(() => {
    vi.resetModules();
    delete process.env.NODERED_ADMIN_AUTH_ENABLED;
  });

  it('is false when unset', async () => {
    const { isNodeRedAdminAuthEnabled } = await import('./auth.js');
    expect(isNodeRedAdminAuthEnabled()).toBe(false);
  });

  it('is false for any value other than the literal string "true"', async () => {
    process.env.NODERED_ADMIN_AUTH_ENABLED = 'false';
    const { isNodeRedAdminAuthEnabled } = await import('./auth.js');
    expect(isNodeRedAdminAuthEnabled()).toBe(false);
  });

  it('is true when set to "true"', async () => {
    process.env.NODERED_ADMIN_AUTH_ENABLED = 'true';
    const { isNodeRedAdminAuthEnabled } = await import('./auth.js');
    expect(isNodeRedAdminAuthEnabled()).toBe(true);
  });
});

describe('resolveNodeRedAuthToken', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    delete process.env.NODERED_USERNAME;
    delete process.env.NODERED_PASSWORD;
    delete process.env.NODERED_API_TOKEN;
    delete process.env.NODERED_ADMIN_AUTH_ENABLED;
    process.env.NODERED_URL = 'http://localhost:1880';
  });

  it('returns the token directly in bearer mode', async () => {
    process.env.NODERED_API_TOKEN = 'static-token';
    const { resolveNodeRedAuthToken } = await import('./auth.js');

    expect(await resolveNodeRedAuthToken()).toBe('static-token');
  });

  it('returns undefined in basic mode when the gate is off', async () => {
    process.env.NODERED_USERNAME = 'admin';
    process.env.NODERED_PASSWORD = 'secret';
    const axios = (await import('axios')).default;
    const { resolveNodeRedAuthToken } = await import('./auth.js');

    expect(await resolveNodeRedAuthToken()).toBeUndefined();
    expect(axios.post).not.toHaveBeenCalled();
  });

  it('returns undefined when no credentials are configured', async () => {
    const { resolveNodeRedAuthToken } = await import('./auth.js');
    expect(await resolveNodeRedAuthToken()).toBeUndefined();
  });

  it('exchanges and returns the token in basic mode when the gate is on, sharing the cache with resolveNodeRedAuthHeader', async () => {
    process.env.NODERED_USERNAME = 'admin';
    process.env.NODERED_PASSWORD = 'secret';
    process.env.NODERED_ADMIN_AUTH_ENABLED = 'true';
    const axios = (await import('axios')).default;
    vi.mocked(axios.post).mockResolvedValue({
      data: { access_token: 'tok-1', expires_in: 3600 },
    });
    const { resolveNodeRedAuthToken, resolveNodeRedAuthHeader } = await import('./auth.js');

    const token = await resolveNodeRedAuthToken();
    const header = await resolveNodeRedAuthHeader();

    expect(token).toBe('tok-1');
    expect(header).toEqual({ Authorization: 'Bearer tok-1' });
    expect(axios.post).toHaveBeenCalledTimes(1);
  });

  it('forceRefresh re-exchanges the token', async () => {
    process.env.NODERED_USERNAME = 'admin';
    process.env.NODERED_PASSWORD = 'secret';
    process.env.NODERED_ADMIN_AUTH_ENABLED = 'true';
    const axios = (await import('axios')).default;
    vi.mocked(axios.post)
      .mockResolvedValueOnce({ data: { access_token: 'tok-1', expires_in: 3600 } })
      .mockResolvedValueOnce({ data: { access_token: 'tok-2', expires_in: 3600 } });
    const { resolveNodeRedAuthToken } = await import('./auth.js');

    await resolveNodeRedAuthToken();
    const refreshed = await resolveNodeRedAuthToken(true);

    expect(refreshed).toBe('tok-2');
    expect(axios.post).toHaveBeenCalledTimes(2);
  });
});
