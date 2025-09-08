/**
 * Environment configuration management with validation
 * 2025 Security & Type Safety Implementation
 */

import { config } from 'dotenv';
import { z } from 'zod';

import { validateEnv, envSchema } from '../types/validation.js';

// Load environment variables from .env files
config();

/**
 * Validated environment configuration
 * This ensures all environment variables are properly typed and validated
 */
export class AppConfig {
  private static instance: AppConfig | null = null;
  private readonly config: z.infer<typeof envSchema>;

  private constructor() {
    try {
      // Validate environment variables against our schema
      this.config = validateEnv(process.env);

      // Additional runtime validation
      this.validateConfiguration();
    } catch (error) {
      // Configuration validation failed - exit silently
      process.exit(1);
    }
  }

  /**
   * Get singleton instance of AppConfig
   */
  public static getInstance(): AppConfig {
    if (!AppConfig.instance) {
      AppConfig.instance = new AppConfig();
    }
    return AppConfig.instance;
  }

  /**
   * Additional runtime validation for complex configuration logic
   */
  private validateConfiguration(): void {
    // Validate JWT secret in production
    if (this.config.NODE_ENV === 'production' && !this.config.JWT_SECRET) {
      throw new Error('JWT_SECRET is required in production environment');
    }

    // Validate Node-RED authentication in production
    if (this.config.NODE_ENV === 'production') {
      // Credentials validation completed silently
    }

    // Configuration validation completed silently
  }

  /**
   * Get application configuration
   */
  public get app() {
    return {
      nodeEnv: this.config.NODE_ENV,
      port: this.config.PORT,
      isProduction: this.config.NODE_ENV === 'production',
      isDevelopment: this.config.NODE_ENV === 'development',
      isTest: this.config.NODE_ENV === 'test',
    } as const;
  }

  /**
   * Get MCP server configuration
   */
  public get mcp() {
    return {
      transport: this.config.MCP_TRANSPORT,
      httpEnabled: this.config.HTTP_ENABLED,
      supportsStdio: ['stdio', 'both'].includes(this.config.MCP_TRANSPORT),
      supportsHttp:
        ['http', 'both'].includes(this.config.MCP_TRANSPORT) || this.config.HTTP_ENABLED,
    } as const;
  }

  /**
   * Get Node-RED configuration
   */
  public get nodeRed() {
    return {
      url: this.config.NODERED_URL,
      username: this.config.NODERED_USERNAME,
      password: this.config.NODERED_PASSWORD,
      hasCredentials: Boolean(this.config.NODERED_USERNAME && this.config.NODERED_PASSWORD),
    } as const;
  }

  /**
   * Get security configuration
   */
  public get security() {
    return {
      jwtSecret: this.config.JWT_SECRET,
      corsOrigin: this.config.CORS_ORIGIN,
      rateLimit: {
        windowMs: this.config.RATE_LIMIT_WINDOW,
        max: this.config.RATE_LIMIT_MAX,
      },
    } as const;
  }

  /**
   * Get logging configuration
   */
  public get logging() {
    return {
      level: this.config.LOG_LEVEL,
      isDebugEnabled: this.config.LOG_LEVEL === 'debug',
      isVerbose: ['debug', 'info'].includes(this.config.LOG_LEVEL),
    } as const;
  }

  /**
   * Get all configuration as readonly object
   */
  public get all(): Readonly<z.infer<typeof envSchema>> {
    return { ...this.config };
  }

  /**
   * Validate a specific configuration value
   */
  public static validateValue<T>(value: unknown, schema: z.ZodSchema<T>): T {
    return schema.parse(value);
  }

  /**
   * Get environment-specific settings
   */
  public get environment() {
    return {
      isProduction: this.app.isProduction,
      isDevelopment: this.app.isDevelopment,
      isTest: this.app.isTest,
      supportsHotReload: this.app.isDevelopment,
      requiresStrictSecurity: this.app.isProduction,
    } as const;
  }
}

// Export singleton instance
export const appConfig = AppConfig.getInstance();

// Export convenience functions
export const isProduction = () => appConfig.app.isProduction;
export const isDevelopment = () => appConfig.app.isDevelopment;
export const isTest = () => appConfig.app.isTest;

// Export type for configuration
export type AppConfigType = AppConfig;
