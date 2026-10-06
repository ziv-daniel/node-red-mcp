/**
 * Global setup for Playwright E2E tests
 * Runs once before all tests
 */

import type { FullConfig } from '@playwright/test';

async function globalSetup(config: FullConfig) {
  console.log('🚀 Starting E2E test environment setup...');

  // Set up test environment variables
  process.env.NODE_ENV = 'test';
  process.env.MCP_TRANSPORT = 'http';
  process.env.HTTP_ENABLED = 'true';
  process.env.PORT ||= '3000';
  process.env.NODERED_URL ||= 'http://localhost:1880';

  // Setup test data or configuration if needed
  console.log('✅ Environment variables configured');
  console.log('✅ Global E2E setup completed');

  return async () => {
    // This function runs after all tests complete
    console.log('🧹 Global E2E teardown completed');
  };
}

export default globalSetup;
