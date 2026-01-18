/**
 * Tests for MCP Server functionality
 *
 * Updated for MCP SDK 1.24.x compatibility
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { describe, it, expect, beforeEach, vi } from 'vitest';

import { NodeRedAPIClient } from '../services/nodered-api.js';

import { McpNodeRedServer } from './mcp-server.js';
import { SSEHandler } from './sse-handler.js';

// Create mock instances that will be returned by the mocked constructors
const mockNodeRedClient = {
  getFlows: vi.fn(),
  getFlow: vi.fn(),
  createFlow: vi.fn(),
  updateFlow: vi.fn(),
  enableFlow: vi.fn(),
  disableFlow: vi.fn(),
  searchModules: vi.fn(),
  installModule: vi.fn(),
  getInstalledModules: vi.fn(),
  testConnection: vi.fn().mockResolvedValue(true),
};

const mockSSEHandler = {
  start: vi.fn(),
  stop: vi.fn(),
  broadcast: vi.fn(),
  destroy: vi.fn(),
};

// Mock NodeRedAPIClient with a class
vi.mock('../services/nodered-api.js', () => {
  return {
    NodeRedAPIClient: class {
      constructor() {
        return mockNodeRedClient;
      }
    },
  };
});

// Mock SSEHandler with a class
vi.mock('./sse-handler.js', () => {
  return {
    SSEHandler: class {
      constructor() {
        return mockSSEHandler;
      }
    },
  };
});

// Mock MCP SDK Server
vi.mock('@modelcontextprotocol/sdk/server/index.js', () => {
  return {
    Server: class {
      handlers = new Map();
      setRequestHandler = vi.fn((schema: any, handler: any) => {
        this.handlers.set(schema, handler);
      });
      connect = vi.fn();
    },
  };
});

describe('McpNodeRedServer', () => {
  let mcpServer: McpNodeRedServer;

  beforeEach(() => {
    vi.clearAllMocks();

    // Setup environment variables
    process.env.NODERED_URL = 'http://localhost:1880';
    process.env.MCP_SERVER_NAME = 'test-server';
    process.env.MCP_SERVER_VERSION = '1.0.0';

    // Reset mock implementation functions
    mockNodeRedClient.testConnection.mockResolvedValue(true);

    mcpServer = new McpNodeRedServer();
  });

  describe('Initialization', () => {
    it('should create server with default configuration', () => {
      expect(mcpServer).toBeDefined();
      expect(mcpServer.getServer()).toBeDefined();
    });

    it('should create server with custom configuration', () => {
      const customConfig = {
        name: 'custom-server',
        version: '2.0.0',
        nodeRed: {
          url: 'http://custom:1880',
          timeout: 10000,
          retries: 5,
        },
      };

      const customServer = new McpNodeRedServer(customConfig);
      expect(customServer).toBeDefined();
      expect(customServer.getServer()).toBeDefined();
    });

    it('should initialize NodeRedAPIClient', () => {
      expect(mcpServer.getNodeRedClient()).toBeDefined();
      expect(mcpServer.getNodeRedClient()).toBe(mockNodeRedClient);
    });

    it('should initialize SSEHandler', () => {
      expect(mcpServer.getSSEHandler()).toBeDefined();
      expect(mcpServer.getSSEHandler()).toBe(mockSSEHandler);
    });
  });

  describe('Tool Definitions', () => {
    it('should return tool definitions', () => {
      const tools = mcpServer.getToolDefinitions();
      expect(tools).toBeDefined();
      expect(Array.isArray(tools)).toBe(true);
      expect(tools.length).toBeGreaterThan(0);
    });

    it('should include get_flows tool', () => {
      const tools = mcpServer.getToolDefinitions();
      const getFlowsTool = tools.find(t => t.name === 'get_flows');
      expect(getFlowsTool).toBeDefined();
      expect(getFlowsTool?.description).toBeDefined();
      expect(getFlowsTool?.inputSchema).toBeDefined();
    });

    it('should include get_flow tool', () => {
      const tools = mcpServer.getToolDefinitions();
      const getFlowTool = tools.find(t => t.name === 'get_flow');
      expect(getFlowTool).toBeDefined();
    });

    it('should include create_flow tool', () => {
      const tools = mcpServer.getToolDefinitions();
      const createFlowTool = tools.find(t => t.name === 'create_flow');
      expect(createFlowTool).toBeDefined();
    });

    it('should include search_modules tool', () => {
      const tools = mcpServer.getToolDefinitions();
      const searchModulesTool = tools.find(t => t.name === 'search_modules');
      expect(searchModulesTool).toBeDefined();
    });
  });

  describe('Server Methods', () => {
    it('should expose getServer method', () => {
      const server = mcpServer.getServer();
      expect(server).toBeDefined();
    });

    it('should expose start method', async () => {
      expect(typeof mcpServer.start).toBe('function');
      await expect(mcpServer.start()).resolves.not.toThrow();
      expect(mockNodeRedClient.testConnection).toHaveBeenCalled();
    });

    it('should expose stop method', async () => {
      expect(typeof mcpServer.stop).toBe('function');
      await expect(mcpServer.stop()).resolves.not.toThrow();
    });

    it('should expose getSSEHandler method', () => {
      const handler = mcpServer.getSSEHandler();
      expect(handler).toBeDefined();
    });

    it('should expose getNodeRedClient method', () => {
      const client = mcpServer.getNodeRedClient();
      expect(client).toBeDefined();
    });
  });
});
