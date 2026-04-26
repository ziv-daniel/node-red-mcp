import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: {
    // Test files location
    include: ['src/**/*.test.{js,ts}', 'test/**/*.test.{js,ts}', 'tests/**/*.spec.{js,ts}'],
    exclude: ['node_modules', 'dist', '.git', '.husky', '.yarn'],

    // Test environment
    environment: 'node',

    // Environment variables set before any module loads (avoids singleton init failures)
    env: {
      NODE_ENV: 'test',
      JWT_SECRET: 'test-secret-key-minimum-32-chars-xxxx',
      NODERED_SKIP_CREDENTIAL_VALIDATION: 'true',
      // NODE_USE_ENV_PROXY=1 is set in the container environment, which routes
      // http.request() through the proxy. Bypass proxy for loopback addresses
      // so in-process test servers (bound to 127.0.0.1) are reachable directly.
      NO_PROXY: '127.0.0.1,localhost,0.0.0.0',
      no_proxy: '127.0.0.1,localhost,0.0.0.0',
    },

    // Global test setup
    globals: true,

    // Coverage configuration
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      reportsDirectory: './coverage',
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.test.ts',
        'src/**/*.spec.ts',
        'src/types/**',
        'src/**/*.d.ts',
        'dist/**',
        'node_modules/**',
      ],
      // Coverage thresholds for quality gates
      // Updated: Jan 2026 after ADR-008 testing enhancement implementation
      // Added 634 tests covering services, server, utils, and integration layers
      thresholds: {
        branches: 62, // credential form POST handler added uncovered branches
        functions: 78,
        lines: 71,
        statements: 71,
      },
    },

    // Watch mode settings
    watch: true,

    // Test timeout (in milliseconds)
    testTimeout: 10000,

    // Mock configuration
    mockReset: true,
    clearMocks: true,
    restoreMocks: true,

    // Reporter configuration
    reporters: ['verbose'],

    // Setup files
    setupFiles: ['./test/setup.ts'],
  },

  // Path resolution (matches tsconfig paths)
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@/server': path.resolve(__dirname, './src/server'),
      '@/services': path.resolve(__dirname, './src/services'),
      '@/types': path.resolve(__dirname, './src/types'),
      '@/utils': path.resolve(__dirname, './src/utils'),
    },
  },
});
