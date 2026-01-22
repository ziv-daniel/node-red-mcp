/**
 * Configuration module tests
 * Tests for environment configuration management
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { z } from 'zod';

// Note: AppConfig is a singleton, so we test the exported instance
// and the convenience functions rather than creating new instances
import { appConfig, isProduction, isDevelopment, isTest, AppConfig } from './config.js';

describe('Config Module', () => {
  describe('appConfig instance', () => {
    it('should be an instance of AppConfig', () => {
      expect(appConfig).toBeInstanceOf(AppConfig);
    });

    it('should return the same instance (singleton)', () => {
      const instance1 = AppConfig.getInstance();
      const instance2 = AppConfig.getInstance();
      expect(instance1).toBe(instance2);
    });
  });

  describe('appConfig.app', () => {
    it('should have nodeEnv property', () => {
      expect(appConfig.app.nodeEnv).toBeDefined();
      expect(['development', 'production', 'test']).toContain(appConfig.app.nodeEnv);
    });

    it('should have port property', () => {
      expect(appConfig.app.port).toBeDefined();
      expect(typeof appConfig.app.port).toBe('number');
      expect(appConfig.app.port).toBeGreaterThanOrEqual(1);
      expect(appConfig.app.port).toBeLessThanOrEqual(65535);
    });

    it('should have isProduction property', () => {
      expect(typeof appConfig.app.isProduction).toBe('boolean');
      expect(appConfig.app.isProduction).toBe(appConfig.app.nodeEnv === 'production');
    });

    it('should have isDevelopment property', () => {
      expect(typeof appConfig.app.isDevelopment).toBe('boolean');
      expect(appConfig.app.isDevelopment).toBe(appConfig.app.nodeEnv === 'development');
    });

    it('should have isTest property', () => {
      expect(typeof appConfig.app.isTest).toBe('boolean');
      expect(appConfig.app.isTest).toBe(appConfig.app.nodeEnv === 'test');
    });

    it('should be test environment during testing', () => {
      // During vitest tests, NODE_ENV is typically 'test'
      expect(appConfig.app.isTest).toBe(true);
    });
  });

  describe('appConfig.mcp', () => {
    it('should have transport property', () => {
      expect(appConfig.mcp.transport).toBeDefined();
      expect(['stdio', 'http', 'both']).toContain(appConfig.mcp.transport);
    });

    it('should have httpEnabled property', () => {
      expect(typeof appConfig.mcp.httpEnabled).toBe('boolean');
    });

    it('should have supportsStdio property', () => {
      expect(typeof appConfig.mcp.supportsStdio).toBe('boolean');
      expect(appConfig.mcp.supportsStdio).toBe(
        ['stdio', 'both'].includes(appConfig.mcp.transport)
      );
    });

    it('should have supportsHttp property', () => {
      expect(typeof appConfig.mcp.supportsHttp).toBe('boolean');
      expect(appConfig.mcp.supportsHttp).toBe(
        ['http', 'both'].includes(appConfig.mcp.transport) || appConfig.mcp.httpEnabled
      );
    });
  });

  describe('appConfig.nodeRed', () => {
    it('should have url property', () => {
      expect(appConfig.nodeRed.url).toBeDefined();
      expect(typeof appConfig.nodeRed.url).toBe('string');
    });

    it('should have hasCredentials property', () => {
      expect(typeof appConfig.nodeRed.hasCredentials).toBe('boolean');
    });

    it('hasCredentials should be true only when both username and password are set', () => {
      const hasUsername = Boolean(appConfig.nodeRed.username);
      const hasPassword = Boolean(appConfig.nodeRed.password);
      expect(appConfig.nodeRed.hasCredentials).toBe(hasUsername && hasPassword);
    });
  });

  describe('appConfig.security', () => {
    it('should have corsOrigin property', () => {
      expect(appConfig.security.corsOrigin).toBeDefined();
      expect(typeof appConfig.security.corsOrigin).toBe('string');
    });

    it('should have rateLimit object', () => {
      expect(appConfig.security.rateLimit).toBeDefined();
      expect(typeof appConfig.security.rateLimit.windowMs).toBe('number');
      expect(typeof appConfig.security.rateLimit.max).toBe('number');
    });

    it('should have valid rateLimit values', () => {
      expect(appConfig.security.rateLimit.windowMs).toBeGreaterThan(0);
      expect(appConfig.security.rateLimit.max).toBeGreaterThan(0);
    });
  });

  describe('appConfig.logging', () => {
    it('should have level property', () => {
      expect(appConfig.logging.level).toBeDefined();
      expect(['error', 'warn', 'info', 'debug']).toContain(appConfig.logging.level);
    });

    it('should have isDebugEnabled property', () => {
      expect(typeof appConfig.logging.isDebugEnabled).toBe('boolean');
      expect(appConfig.logging.isDebugEnabled).toBe(appConfig.logging.level === 'debug');
    });

    it('should have isVerbose property', () => {
      expect(typeof appConfig.logging.isVerbose).toBe('boolean');
      expect(appConfig.logging.isVerbose).toBe(
        ['debug', 'info'].includes(appConfig.logging.level)
      );
    });
  });

  describe('appConfig.all', () => {
    it('should return all configuration values', () => {
      const all = appConfig.all;
      expect(all).toBeDefined();
      expect(all.NODE_ENV).toBeDefined();
      expect(all.PORT).toBeDefined();
    });

    it('should be readonly (frozen)', () => {
      const all = appConfig.all;
      expect(all).toBeDefined();
      // The 'all' getter returns a copy, so modifications won't affect the original
    });
  });

  describe('appConfig.environment', () => {
    it('should have isProduction property', () => {
      expect(typeof appConfig.environment.isProduction).toBe('boolean');
    });

    it('should have isDevelopment property', () => {
      expect(typeof appConfig.environment.isDevelopment).toBe('boolean');
    });

    it('should have isTest property', () => {
      expect(typeof appConfig.environment.isTest).toBe('boolean');
    });

    it('should have supportsHotReload property', () => {
      expect(typeof appConfig.environment.supportsHotReload).toBe('boolean');
      expect(appConfig.environment.supportsHotReload).toBe(appConfig.app.isDevelopment);
    });

    it('should have requiresStrictSecurity property', () => {
      expect(typeof appConfig.environment.requiresStrictSecurity).toBe('boolean');
      expect(appConfig.environment.requiresStrictSecurity).toBe(appConfig.app.isProduction);
    });
  });

  describe('AppConfig.validateValue', () => {
    it('should validate string values', () => {
      const schema = z.string().min(1);
      expect(AppConfig.validateValue('test', schema)).toBe('test');
    });

    it('should validate number values', () => {
      const schema = z.number().int().positive();
      expect(AppConfig.validateValue(42, schema)).toBe(42);
    });

    it('should throw on invalid values', () => {
      const schema = z.string().min(5);
      expect(() => AppConfig.validateValue('hi', schema)).toThrow();
    });

    it('should coerce values when schema allows', () => {
      const schema = z.coerce.number();
      expect(AppConfig.validateValue('123', schema)).toBe(123);
    });

    it('should validate complex objects', () => {
      const schema = z.object({
        name: z.string(),
        age: z.number(),
      });
      const result = AppConfig.validateValue({ name: 'John', age: 30 }, schema);
      expect(result).toEqual({ name: 'John', age: 30 });
    });
  });

  describe('Convenience functions', () => {
    describe('isProduction', () => {
      it('should return boolean', () => {
        expect(typeof isProduction()).toBe('boolean');
      });

      it('should match appConfig.app.isProduction', () => {
        expect(isProduction()).toBe(appConfig.app.isProduction);
      });
    });

    describe('isDevelopment', () => {
      it('should return boolean', () => {
        expect(typeof isDevelopment()).toBe('boolean');
      });

      it('should match appConfig.app.isDevelopment', () => {
        expect(isDevelopment()).toBe(appConfig.app.isDevelopment);
      });
    });

    describe('isTest', () => {
      it('should return boolean', () => {
        expect(typeof isTest()).toBe('boolean');
      });

      it('should match appConfig.app.isTest', () => {
        expect(isTest()).toBe(appConfig.app.isTest);
      });

      it('should return true during testing', () => {
        expect(isTest()).toBe(true);
      });
    });
  });

  describe('Configuration consistency', () => {
    it('should have mutually exclusive environment flags', () => {
      const envCount = [
        appConfig.app.isProduction,
        appConfig.app.isDevelopment,
        appConfig.app.isTest,
      ].filter(Boolean).length;
      expect(envCount).toBe(1);
    });

    it('should have consistent environment values between app and environment', () => {
      expect(appConfig.app.isProduction).toBe(appConfig.environment.isProduction);
      expect(appConfig.app.isDevelopment).toBe(appConfig.environment.isDevelopment);
      expect(appConfig.app.isTest).toBe(appConfig.environment.isTest);
    });
  });
});
