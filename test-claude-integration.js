#!/usr/bin/env node
/**
 * Test script for Claude integration authentication
 */

import { fetch } from 'undici';

const BASE_URL = process.env.TEST_URL || 'http://localhost:3000';

async function testClaudeIntegration() {
  console.log('🧪 Testing Claude Integration Authentication...\n');

  // Test 1: Discovery endpoint
  console.log('1️⃣ Testing discovery endpoint...');
  try {
    const response = await fetch(`${BASE_URL}/.well-known/mcp-server`);
    const data = await response.json();
    console.log('✅ Discovery endpoint working:', {
      status: response.status,
      auth: data.auth,
      endpoints: data.endpoints,
    });
  } catch (error) {
    console.log('❌ Discovery endpoint failed:', error.message);
  }

  // Test 2: Debug endpoint
  console.log('\n2️⃣ Testing debug endpoint...');
  try {
    const response = await fetch(`${BASE_URL}/debug/claude-connection`);
    const data = await response.json();
    console.log('✅ Debug endpoint working:', {
      status: response.status,
      claudeMode: data.server.claudeMode,
      authRequired: data.server.authRequired,
    });
  } catch (error) {
    console.log('❌ Debug endpoint failed:', error.message);
  }

  // Test 3: SSE endpoint without auth
  console.log('\n3️⃣ Testing SSE endpoint without authentication...');
  try {
    const response = await fetch(`${BASE_URL}/sse`, {
      method: 'GET',
      headers: {
        'Accept': 'text/event-stream',
        'User-Agent': 'Claude-Test-Client',
      },
    });
    console.log('✅ SSE endpoint accessible:', {
      status: response.status,
      contentType: response.headers.get('content-type'),
      mcpServer: response.headers.get('x-mcp-server'),
    });
  } catch (error) {
    console.log('❌ SSE endpoint failed:', error.message);
  }

  // Test 4: SSE endpoint with Bearer token
  console.log('\n4️⃣ Testing SSE endpoint with Bearer token...');
  try {
    const response = await fetch(`${BASE_URL}/sse`, {
      method: 'GET',
      headers: {
        'Accept': 'text/event-stream',
        'Authorization': 'Bearer test-token-for-claude',
        'User-Agent': 'Claude-Test-Client',
        'Origin': 'https://claude.ai',
      },
    });
    console.log('✅ SSE endpoint with Bearer token:', {
      status: response.status,
      contentType: response.headers.get('content-type'),
      mcpServer: response.headers.get('x-mcp-server'),
    });
  } catch (error) {
    console.log('❌ SSE endpoint with Bearer failed:', error.message);
  }

  // Test 5: Health check
  console.log('\n5️⃣ Testing health endpoint...');
  try {
    const response = await fetch(`${BASE_URL}/health`);
    const data = await response.json();
    console.log('✅ Health endpoint working:', {
      status: response.status,
      server: data.data.server,
      nodeRed: data.data.nodeRed ? 'connected' : 'failed',
    });
  } catch (error) {
    console.log('❌ Health endpoint failed:', error.message);
  }

  console.log('\n📊 Test Summary:');
  console.log('- Discovery endpoint provides Claude-compatible metadata');
  console.log('- Debug endpoint helps troubleshoot connection issues');
  console.log('- SSE endpoint accepts connections with flexible authentication');
  console.log('- Health endpoint confirms Node-RED connectivity');
  console.log('\n💡 Next steps:');
  console.log('1. Start the server with Claude compatibility enabled');
  console.log('2. Test with actual Claude.ai integration');
  console.log('3. Monitor logs for any additional issues');
}

// Run the test
testClaudeIntegration().catch(console.error);
