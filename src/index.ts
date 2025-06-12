/**
 * Main application entry point for MCP Node-RED Server
 */

import dotenv from 'dotenv';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

// Load environment variables
dotenv.config();
import { McpNodeRedServer } from './server/mcp-server.js';
import { ExpressApp } from './server/express-app.js';

// Configuration from environment variables
const transport = process.env.MCP_TRANSPORT || 'stdio';
const httpEnabled = process.env.HTTP_ENABLED === 'true' || transport === 'http';

// Helper function to log safely based on transport mode
function safeLog(message: string): void {
  if (transport === 'stdio') {
    // In stdio mode, write to stderr to avoid polluting stdout which is used for JSON-RPC
    console.error(message);
  } else {
    // In other modes, use regular console.log
    console.log(message);
  }
}

async function main(): Promise<void> {
  safeLog('🚀 Starting MCP Node-RED Server...');
  safeLog(`📋 Configuration:`);
  safeLog(`   Transport: ${transport}`);
  safeLog(`   HTTP Enabled: ${httpEnabled}`);
  safeLog(`   Port: ${process.env.PORT || 3000}`);

  try {
    // Create MCP server instance
    const mcpServer = new McpNodeRedServer();

    // Start MCP server
    await mcpServer.start();

    if (transport === 'stdio' || transport === 'both') {
      safeLog('📡 Starting MCP server with stdio transport...');

      // Setup stdio transport
      const stdinTransport = new StdioServerTransport();
      await mcpServer.getServer().connect(stdinTransport);

      safeLog('✅ MCP server connected via stdio');
      safeLog('📝 Server is ready to receive MCP requests via stdin/stdout');
    } else if (transport === 'http') {
      safeLog('📡 MCP server configured for HTTP transport only (no stdio)');
    }

    if (httpEnabled || transport === 'http' || transport === 'both') {
      safeLog('🌐 Starting HTTP server with SSE support...');

      // Create and start Express app
      const expressApp = new ExpressApp(mcpServer);
      await expressApp.start();

      // Start system monitoring for SSE
      expressApp.startSystemMonitoring();

      safeLog('✅ HTTP server started with SSE support');
      safeLog('📡 Real-time events available via Server-Sent Events');
    }

    // Log server capabilities
    safeLog('\n🔧 Server Capabilities:');
    safeLog('  ✓ Tools: Node-RED flow and node management');
    safeLog('  ✓ Resources: Flow configurations and system info');
    safeLog('  ✓ Prompts: Node-RED automation templates');
    if (httpEnabled || transport !== 'stdio') {
      safeLog('  ✓ SSE: Real-time monitoring and events');
    }

    safeLog('\n🎯 Ready to serve MCP requests!');
    safeLog('💡 Use an MCP client to interact with Node-RED');

    if (transport === 'stdio') {
      safeLog('📋 For stdio mode, pipe MCP requests to stdin');
    }

    if (httpEnabled || transport !== 'stdio') {
      safeLog('🌍 For HTTP mode, connect to the server endpoints');
      safeLog(
        `   Health check: http://localhost:${process.env.PORT || 3000}/health`,
      );
      safeLog(
        `   SSE events: http://localhost:${process.env.PORT || 3000}/api/events`,
      );
    }
  } catch (error) {
    console.error('❌ Failed to start MCP Node-RED Server:', error);
    process.exit(1);
  }
}

// Handle uncaught exceptions and rejections
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Start the application
main().catch((error) => {
  console.error('Failed to start application:', error);
  process.exit(1);
});
