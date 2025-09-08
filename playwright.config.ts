import { defineConfig, devices } from '@playwright/test';
import type { PlaywrightTestConfig } from '@playwright/test';

/**
 * Playwright configuration for Node-RED MCP Server E2E testing
 * @see https://playwright.dev/docs/test-configuration
 */
export default defineConfig({
  testDir: './e2e',

  // Test timeout configuration
  timeout: 30 * 1000, // 30 seconds per test
  expect: {
    timeout: 10 * 1000, // 10 seconds for assertions
  },

  // Retry configuration
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,

  // Reporter configuration
  reporter: [
    ['html', { open: 'never' }],
    ['json', { outputFile: 'e2e-results.json' }],
    process.env.CI ? ['github'] : ['list'],
  ],

  // Global test settings
  use: {
    // Base URL for your application
    baseURL: process.env.BASE_URL || 'http://localhost:3000',

    // Screenshot and video on failure
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',

    // Trace collection for debugging
    trace: 'retain-on-failure',

    // Browser context settings
    locale: 'en-US',
    timezoneId: 'America/New_York',

    // Ignore HTTPS errors in development
    ignoreHTTPSErrors: true,

    // Action timeout
    actionTimeout: 10 * 1000,
  },

  // Test projects for different browsers
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },
    // Mobile testing
    {
      name: 'Mobile Chrome',
      use: { ...devices['Pixel 5'] },
    },
  ],

  // Web server configuration for testing
  webServer: [
    {
      // Start the Node-RED MCP Server
      command: 'yarn start',
      url: 'http://localhost:3000/health',
      reuseExistingServer: !process.env.CI,
      timeout: 120 * 1000, // 2 minutes to start
      env: {
        NODE_ENV: 'test',
        PORT: '3000',
        MCP_TRANSPORT: 'http',
        HTTP_ENABLED: 'true',
      },
    },
    {
      // Start Node-RED instance for integration testing
      command: 'npx node-red --settings e2e/node-red-settings.js --userDir e2e/node-red-data',
      url: 'http://localhost:1880',
      reuseExistingServer: !process.env.CI,
      timeout: 60 * 1000,
      env: {
        NODE_ENV: 'test',
      },
    },
  ],

  // Output directory for test artifacts
  outputDir: './e2e-results/',

  // Global setup and teardown
  globalSetup: './e2e/global-setup.ts',
  globalTeardown: './e2e/global-teardown.ts',

  // Test file patterns
  testMatch: ['e2e/**/*.spec.ts', 'e2e/**/*.e2e.ts'],

  // Ignore files
  testIgnore: ['e2e/node-red-data/**', 'e2e-results/**'],
});
