/**
 * Vitest global setup and configuration
 */

import { vi } from 'vitest';

// Mock environment variables for testing
process.env.NODE_ENV = 'test';
process.env.MCP_TRANSPORT = 'stdio';
process.env.HTTP_ENABLED = 'false';
process.env.PORT = '3001';

// Global test utilities
global.TEST_TIMEOUT = 5000;

// Mock console methods in tests to reduce noise
const originalConsole = { ...console };

beforeEach(() => {
  // Mock console methods but allow them to be restored
  vi.spyOn(console, 'log').mockImplementation(() => {
    // Intentionally empty for testing
  });
  vi.spyOn(console, 'warn').mockImplementation(() => {
    // Intentionally empty for testing
  });
  vi.spyOn(console, 'error').mockImplementation(() => {
    // Intentionally empty for testing
  });
  vi.spyOn(console, 'info').mockImplementation(() => {
    // Intentionally empty for testing
  });
});

afterEach(() => {
  // Restore all mocks after each test
  vi.restoreAllMocks();
});

// Restore original console for debugging when needed
export { originalConsole };
