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
      // Note: Set to current baseline levels. Gradually increase as more tests are added.
      thresholds: {
        branches: 95, // Current: 96.96%
        functions: 70, // Current: 71.42%
        lines: 4, // Current: 4.24%
        statements: 4, // Current: 4.24%
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
