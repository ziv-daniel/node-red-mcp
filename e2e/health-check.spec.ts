/**
 * E2E tests for basic server health and functionality
 */

import { test, expect } from '@playwright/test';

test.describe('MCP Server Health Check', () => {
  test('should respond to health check endpoint', async ({ request }) => {
    const response = await request.get('/health');

    expect(response.status()).toBe(200);

    const responseData = await response.json();
    expect(responseData).toHaveProperty('status', 'healthy');
    expect(responseData).toHaveProperty('timestamp');
  });

  test('should respond to system info endpoint', async ({ request }) => {
    const response = await request.get('/api/system-info');

    expect(response.status()).toBe(200);

    const responseData = await response.json();
    expect(responseData).toHaveProperty('nodeVersion');
    expect(responseData).toHaveProperty('platform');
  });

  test('should handle invalid endpoints gracefully', async ({ request }) => {
    const response = await request.get('/api/nonexistent-endpoint');

    expect([400, 404]).toContain(response.status());
  });
});

test.describe('SSE Event Stream', () => {
  test('should provide SSE events endpoint', async ({ request }) => {
    const response = await request.get('/api/events', {
      headers: {
        Accept: 'text/event-stream',
      },
    });

    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toContain('text/event-stream');
  });
});

test.describe('CORS Configuration', () => {
  test('should handle CORS preflight requests', async ({ request }) => {
    const response = await request.fetch('/api/system-info', {
      method: 'OPTIONS',
      headers: {
        Origin: 'http://localhost:3000',
        'Access-Control-Request-Method': 'GET',
      },
    });

    expect(response.status()).toBe(200);
    expect(response.headers()).toHaveProperty('access-control-allow-origin');
  });
});
