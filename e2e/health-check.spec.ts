/**
 * E2E tests for basic server health and functionality
 */

import { test, expect } from '@playwright/test';

test.describe('MCP Server Health Check', () => {
  test('should respond to health check endpoint', async ({ request }) => {
    const response = await request.get('/health');

    expect([200, 204]).toContain(response.status());

    const responseData = await response.json();
    expect(responseData).toHaveProperty('status', 'ok');
    expect(responseData).toHaveProperty('timestamp');
    expect(responseData).toHaveProperty('nodeRed');
  });

  test('should respond to api info endpoint', async ({ request }) => {
    const response = await request.get('/api/info');

    expect([200, 204]).toContain(response.status());

    const responseData = await response.json();
    expect(responseData).toHaveProperty('success', true);
    expect(responseData.data).toHaveProperty('name');
    expect(responseData.data).toHaveProperty('version');
  });

  test('should handle invalid endpoints gracefully', async ({ request }) => {
    const response = await request.get('/api/nonexistent-endpoint');

    expect([400, 404]).toContain(response.status());
  });
});

test.describe('SSE Event Stream', () => {
  test('should provide SSE events endpoint', async ({ request }) => {
    const response = await request.get('/sse', {
      headers: {
        Accept: 'text/event-stream',
      },
    });

    // Without auth, expect 401; with CLAUDE_AUTH_REQUIRED=false it returns 200
    expect([200, 401]).toContain(response.status());
    if (response.status() === 200) {
      expect(response.headers()['content-type']).toContain('text/event-stream');
    }
  });
});

test.describe('CORS Configuration', () => {
  test('should handle CORS preflight requests', async ({ request }) => {
    const response = await request.fetch('/api/info', {
      method: 'OPTIONS',
      headers: {
        Origin: 'http://localhost:3000',
        'Access-Control-Request-Method': 'GET',
      },
    });

    expect([200, 204]).toContain(response.status());
    expect(response.headers()).toHaveProperty('access-control-allow-origin');
  });
});
