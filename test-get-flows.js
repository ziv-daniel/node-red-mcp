#!/usr/bin/env node

const { spawn } = require('child_process');

/**
 * Test the get_flows tool with our new implementation
 */
async function testGetFlows() {
  console.log('🧪 Testing get_flows tool...');

  const server = spawn('node', ['dist/index.js'], {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, NODE_RED_URL: 'https://nodered.danielshaprvt.work' }
  });

  let stdoutData = '';
  let stderrData = '';

  server.stdout.on('data', (data) => {
    stdoutData += data.toString();
  });

  server.stderr.on('data', (data) => {
    stderrData += data.toString();
  });

  // Wait for server to start
  await new Promise(resolve => setTimeout(resolve, 2000));

  console.log('📋 STDERR (server logs):', stderrData);

  // Send initialize request
  const initRequest = {
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'test-client', version: '1.0.0' }
    }
  };

  console.log('📨 Sending initialize request...');
  server.stdin.write(JSON.stringify(initRequest) + '\n');

  // Wait for response
  await new Promise(resolve => setTimeout(resolve, 1000));

  // Send get_flows request (default behavior)
  const getFlowsRequest = {
    jsonrpc: '2.0',
    id: 2,
    method: 'tools/call',
    params: {
      name: 'get_flows',
      arguments: {}
    }
  };

  console.log('📨 Sending get_flows request (default)...');
  server.stdin.write(JSON.stringify(getFlowsRequest) + '\n');

  // Wait for response
  await new Promise(resolve => setTimeout(resolve, 3000));

  // Send get_flows request with types parameter
  const getFlowsTypesRequest = {
    jsonrpc: '2.0',
    id: 3,
    method: 'tools/call',
    params: {
      name: 'get_flows',
      arguments: {
        types: ['tab']
      }
    }
  };

  console.log('📨 Sending get_flows request (tabs only)...');
  server.stdin.write(JSON.stringify(getFlowsTypesRequest) + '\n');

  // Wait for response
  await new Promise(resolve => setTimeout(resolve, 3000));

  console.log('📤 STDOUT (responses):');
  const responses = stdoutData.trim().split('\n').filter(line => line.trim());
  responses.forEach((response, index) => {
    try {
      const parsed = JSON.parse(response);
      console.log(`Response ${index + 1}:`, JSON.stringify(parsed, null, 2));
    } catch (e) {
      console.log(`Response ${index + 1} (invalid JSON):`, response);
    }
  });

  server.kill();
  console.log('✅ Test completed!');
}

testGetFlows().catch(console.error);
