/**
 * Tests for authentication utilities
 */

import jwt from 'jsonwebtoken';
import { describe, it, expect, beforeEach } from 'vitest';

// Import the functions we want to test
import { generateToken, verifyToken, extractToken, type AuthPayload } from './auth.js';

describe('Auth Utils', () => {
  const mockSecret = 'test-secret-key';
  const mockPayload: Omit<AuthPayload, 'iat' | 'exp'> = {
    userId: 'user123',
    permissions: ['read', 'write']
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
  it('should use default secret when JWT_SECRET is missing', () => {
    const originalSecret = process.env.JWT_SECRET;
    delete process.env.JWT_SECRET;

    // Should not throw, will use default secret
    const token = generateToken({ userId: 'test', permissions: [] });
    expect(token).toBeDefined();

    // Restore environment variable
    process.env.JWT_SECRET = originalSecret;
  });

  it('should handle malformed JWT tokens', () => {
    const malformedTokens = [
      'not.a.jwt',
      'too.few.parts',
      'too.many.parts.here.invalid',
      '',
    ];

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
