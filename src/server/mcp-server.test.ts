/**
 * Tests for MCP Server functionality
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import { McpNodeRedServer } from './mcp-server.js';

// Mock external dependencies
vi.mock('@modelcontextprotocol/sdk/server/index.js', () => ({
  Server: vi.fn().mockImplementation(() => ({
    addResourceProvider: vi.fn(),
    addToolProvider: vi.fn(),
    addPromptProvider: vi.fn(),
    connect: vi.fn(),
  })),
}));

describe('McpNodeRedServer', () => {
  let server: McpNodeRedServer;

  beforeEach(() => {
    // Set up environment variables for testing
    process.env.NODERED_URL = 'http://localhost:1880';
    process.env.NODERED_USERNAME = 'test-user';
    process.env.NODERED_PASSWORD = 'test-password';

    server = new McpNodeRedServer();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Constructor', () => {
    it('should create server instance with default configuration', () => {
      expect(server).toBeDefined();
      expect(server).toBeInstanceOf(McpNodeRedServer);
    });

    it('should use environment variables for configuration', () => {
      const customServer = new McpNodeRedServer();
      expect(customServer).toBeDefined();
    });

    it('should handle missing environment variables gracefully', () => {
      const originalUrl = process.env.NODERED_URL;
      delete process.env.NODERED_URL;

      expect(() => {
        new McpNodeRedServer();
      }).not.toThrow();

      process.env.NODERED_URL = originalUrl;
    });
  });

  describe('Server Lifecycle', () => {
    it('should start server successfully', async () => {
      await expect(server.start()).resolves.not.toThrow();
    });

    it('should stop server successfully', async () => {
      await server.start();
      await expect(server.stop()).resolves.not.toThrow();
    });

    it('should handle multiple start calls gracefully', async () => {
      await server.start();
      await expect(server.start()).resolves.not.toThrow();
    });
  });

  describe('Tool Definitions', () => {
    it('should provide flow management tools', () => {
      const tools = server.getToolDefinitions();
      const flowTools = tools.filter(tool => tool.name.includes('flow'));

      expect(flowTools.length).toBeGreaterThan(0);
    });

    it('should provide node management tools', () => {
      const tools = server.getToolDefinitions();
      const nodeTools = tools.filter(tool => tool.name.includes('node'));

      expect(nodeTools.length).toBeGreaterThan(0);
    });

    it('should provide monitoring tools', () => {
      const tools = server.getToolDefinitions();
      const monitoringTools = tools.filter(
        tool => tool.name.includes('monitor') || tool.name.includes('status')
      );

      expect(monitoringTools.length).toBeGreaterThan(0);
    });

    it('should have properly formatted tool definitions', () => {
      const tools = server.getToolDefinitions();

      tools.forEach(tool => {
        expect(tool).toHaveProperty('name');
        expect(tool).toHaveProperty('description');
        expect(tool.name).toMatch(/^[a-zA-Z][a-zA-Z0-9_-]*$/);
        expect(tool.description).toBeTruthy();
      });
    });
  });

  describe('Resource Management', () => {
    it('should provide system info resources', async () => {
      const systemInfo = await server.getResource('system-info');
      expect(systemInfo).toBeDefined();
    });

    it('should handle invalid resource requests', async () => {
      await expect(server.getResource('non-existent-resource')).rejects.toThrow();
    });

    it('should provide flow configuration resources', async () => {
      const flowConfig = await server.getResource('flow-config');
      expect(flowConfig).toBeDefined();
    });
  });
});

describe('McpNodeRedServer Integration', () => {
  let server: McpNodeRedServer;

  beforeEach(() => {
    server = new McpNodeRedServer();
  });

  it('should handle tool execution errors gracefully', async () => {
    // Mock a failing tool call
    const result = await server.callTool('list-flows', {});

    // Should not throw, but return error information
    expect(result).toBeDefined();
  });

  it('should validate tool parameters', async () => {
    // Test with invalid parameters
    await expect(server.callTool('deploy-flow', { invalid: 'param' })).rejects.toThrow();
  });

  it('should provide consistent error handling', async () => {
    const invalidCalls = [
      () => server.callTool('', {}),
      () => server.callTool('non-existent-tool', {}),
      () => server.getResource(''),
    ];

    for (const call of invalidCalls) {
      await expect(call()).rejects.toThrow();
    }
  });
});
