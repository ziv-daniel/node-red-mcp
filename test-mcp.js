/**
 * Test script for MCP server
 */

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function testMCPServer() {
  console.log('🧪 Testing MCP server stdio transport...\n');

  // Set environment variables for testing
  const env = {
    ...process.env,
    MCP_TRANSPORT: 'stdio',
    NODE_ENV: 'development',
  };

  // Start MCP server
  const mcpProcess = spawn('node', ['dist/index.js'], {
    env: env,
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  let stdoutData = '';
  let stderrData = '';
  let hasReceivedResponse = false;

  mcpProcess.stdout.on('data', (data) => {
    stdoutData += data.toString();
    console.log('📤 STDOUT (should be JSON only):', data.toString());

    // Check if we got a JSON response
    try {
      const lines = stdoutData.trim().split('\n');
      for (const line of lines) {
        if (line.trim()) {
          const response = JSON.parse(line);
          if (response.id === 0) {
            hasReceivedResponse = true;
            console.log(
              '✅ Received valid JSON response:',
              JSON.stringify(response, null, 2),
            );
          }
        }
      }
    } catch (error) {
      console.log('❌ Invalid JSON in stdout:', error.message);
    }
  });

  mcpProcess.stderr.on('data', (data) => {
    stderrData += data.toString();
    console.log('📋 STDERR (server logs):', data.toString());
  });

  mcpProcess.on('error', (error) => {
    console.error('❌ Process error:', error);
  });

  // Send initialize request
  setTimeout(() => {
    const initRequest = {
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: {
          name: 'test-client',
          version: '1.0.0',
        },
      },
      jsonrpc: '2.0',
      id: 0,
    };

    console.log('📨 Sending initialize request...');
    mcpProcess.stdin.write(JSON.stringify(initRequest) + '\n');
  }, 2000);

  // Check results after a few seconds
  setTimeout(() => {
    console.log('\n📊 Test Results:');
    console.log(
      '- Stdout contains JSON only:',
      !stdoutData.includes('🚀') && !stdoutData.includes('MCP Node-RED'),
    );
    console.log(
      '- Stderr contains logs:',
      stderrData.includes('🚀') || stderrData.includes('MCP Node-RED'),
    );
    console.log('- Received valid response:', hasReceivedResponse);

    if (!stdoutData.includes('🚀') && hasReceivedResponse) {
      console.log('✅ Test PASSED: Console output fixed!');
    } else {
      console.log('❌ Test FAILED: Issues remain');
    }

    mcpProcess.kill();
    process.exit(hasReceivedResponse && !stdoutData.includes('🚀') ? 0 : 1);
  }, 5000);
}

testMCPServer();
