import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: {
    // Test files location
    include: ['src/**/*.test.{js,ts}', 'test/**/*.test.{js,ts}'],
    exclude: ['node_modules', 'dist', '.git', '.husky', '.yarn'],

    // Test environment
    environment: 'node',

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
      // Note: Set to current baseline levels (Jan 2026). Gradually increase as more tests are added.
      // TODO: Increase these thresholds as E2E tests and integration tests are re-enabled
      thresholds: {
        branches: 8, // Current: 8.8% (after SDK upgrade and test restoration)
        functions: 10, // Current: 10.38% (after SDK upgrade and test restoration)
        lines: 4, // Current: 6.85%
        statements: 4, // Current: 7.17%
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
