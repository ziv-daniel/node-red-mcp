/**
 * Main application entry point for MCP Node-RED Server
 */

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import dotenv from 'dotenv';

// Load environment variables silently - suppress all dotenv output
const originalConsoleLog = console.log;
console.log = () => {}; // Temporarily suppress console.log
dotenv.config();
console.log = originalConsoleLog; // Restore console.log
import { ExpressApp } from './server/express-app.js';
import { McpNodeRedServer } from './server/mcp-server.js';

// Configuration from environment variables
const transport = process.env.MCP_TRANSPORT || 'stdio';
const httpEnabled = process.env.HTTP_ENABLED === 'true' || transport === 'http';

// No logging function needed

async function main(): Promise<void> {
  try {
    // Create MCP server instance
    const mcpServer = new McpNodeRedServer();

    // Start MCP server
    await mcpServer.start();

    if (transport === 'stdio' || transport === 'both') {
      // Setup stdio transport
      const stdinTransport = new StdioServerTransport();
      await mcpServer.getServer().connect(stdinTransport);
    }

    if (httpEnabled || transport === 'http' || transport === 'both') {
      // Create and start Express app
      const expressApp = new ExpressApp(mcpServer);
      await expressApp.start();

      // Start system monitoring for SSE
      expressApp.startSystemMonitoring();
    }
  } catch (error) {
    process.exit(1);
  }
}

// Handle uncaught exceptions and rejections
process.on('uncaughtException', () => {
  process.exit(1);
});

process.on('unhandledRejection', () => {
  process.exit(1);
});

// Start the application
main().catch(() => {
  process.exit(1);
});
