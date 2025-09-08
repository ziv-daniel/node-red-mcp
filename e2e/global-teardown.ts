/**
 * Global teardown for Playwright E2E tests
 * Runs once after all tests complete
 */

import type { FullConfig } from '@playwright/test';

async function globalTeardown(config: FullConfig) {
  console.log('🧹 Starting E2E test environment teardown...');

  // Clean up test data or resources if needed
  // Reset environment variables
  delete process.env.MCP_TRANSPORT;
  delete process.env.HTTP_ENABLED;

  console.log('✅ Global E2E teardown completed');
}

export default globalTeardown;
