/**
 * Tests for authentication utilities
 */

import jwt from 'jsonwebtoken';
import { describe, it, expect, beforeEach, vi } from 'vitest';

// Import the functions we want to test
import { generateToken, verifyToken, createAuthContext } from './auth.js';

describe('Auth Utils', () => {
  const mockSecret = 'test-secret-key';
  const mockPayload = { userId: 'user123', role: 'admin' };

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
      const token1 = generateToken({ userId: 'user1' });
      const token2 = generateToken({ userId: 'user2' });

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

      expect(result.valid).toBe(true);
      expect(result.payload).toMatchObject(mockPayload);
    });

    it('should reject an invalid token', () => {
      const result = verifyToken('invalid.token.here');

      expect(result.valid).toBe(false);
      expect(result.payload).toBe(null);
    });

    it('should reject an empty token', () => {
      const result = verifyToken('');

      expect(result.valid).toBe(false);
      expect(result.payload).toBe(null);
    });

    it('should handle expired tokens', () => {
      // Create a token that expires immediately
      const expiredToken = jwt.sign(mockPayload, mockSecret, { expiresIn: '-1s' });
      const result = verifyToken(expiredToken);

      expect(result.valid).toBe(false);
      expect(result.payload).toBe(null);
    });
  });

  describe('createAuthContext', () => {
    it('should create auth context with valid token', () => {
      const token = generateToken(mockPayload);
      const context = createAuthContext(token);

      expect(context.isAuthenticated).toBe(true);
      expect(context.user).toMatchObject(mockPayload);
    });

    it('should create empty context with invalid token', () => {
      const context = createAuthContext('invalid-token');

      expect(context.isAuthenticated).toBe(false);
      expect(context.user).toBe(null);
    });

    it('should handle missing token', () => {
      const context = createAuthContext();

      expect(context.isAuthenticated).toBe(false);
      expect(context.user).toBe(null);
    });
  });
});

describe('Auth Utils Edge Cases', () => {
  it('should handle missing JWT_SECRET environment variable', () => {
    const originalSecret = process.env.JWT_SECRET;
    delete process.env.JWT_SECRET;

    expect(() => {
      generateToken({ userId: 'test' });
    }).toThrow();

    // Restore environment variable
    process.env.JWT_SECRET = originalSecret;
  });

  it('should handle malformed JWT tokens', () => {
    const malformedTokens = [
      'not.a.jwt',
      'too.few.parts',
      'too.many.parts.here.invalid',
      '',
      null,
      undefined,
    ];

    malformedTokens.forEach(token => {
      const result = verifyToken(token!);
      expect(result.valid).toBe(false);
      expect(result.payload).toBe(null);
    });
  });
});
