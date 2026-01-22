/**
 * Tests for MCP Server functionality
 *
 * Comprehensive tests for MCP Server including tool execution,
 * resources, prompts, and error handling.
 *
 * Updated for MCP SDK 1.24.x compatibility
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { describe, it, expect, beforeEach, vi } from 'vitest';

import {
  mockFlows,
  mockFlowTab,
  mockFlowSummaries,
  mockCreatedFlow,
} from '../../test/fixtures/flows.js';
import {
  mockSearchResult,
  mockInstallSuccess,
  mockInstalledModules,
  mockRuntimeInfo,
} from '../../test/fixtures/responses.js';
import { NodeRedAPIClient } from '../services/nodered-api.js';

import { McpNodeRedServer } from './mcp-server.js';
import { SSEHandler } from './sse-handler.js';

// Create mock instances that will be returned by the mocked constructors
const mockNodeRedClient = {
  getFlows: vi.fn(),
  getFlowSummaries: vi.fn(),
  getFlow: vi.fn(),
  createFlow: vi.fn(),
  updateFlow: vi.fn(),
  enableFlow: vi.fn(),
  disableFlow: vi.fn(),
  searchModules: vi.fn(),
  installModule: vi.fn(),
  getInstalledModules: vi.fn(),
  testConnection: vi.fn().mockResolvedValue(true),
  getRuntimeInfo: vi.fn(),
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
    mockNodeRedClient.getFlows.mockResolvedValue(mockFlows);
    mockNodeRedClient.getFlowSummaries.mockResolvedValue(mockFlowSummaries);
    mockNodeRedClient.getFlow.mockResolvedValue(mockFlowTab);
    mockNodeRedClient.createFlow.mockResolvedValue(mockCreatedFlow);
    mockNodeRedClient.updateFlow.mockResolvedValue(mockFlowTab);
    mockNodeRedClient.enableFlow.mockResolvedValue(undefined);
    mockNodeRedClient.disableFlow.mockResolvedValue(undefined);
    mockNodeRedClient.searchModules.mockResolvedValue(mockSearchResult);
    mockNodeRedClient.installModule.mockResolvedValue(mockInstallSuccess);
    mockNodeRedClient.getInstalledModules.mockResolvedValue(mockInstalledModules);
    mockNodeRedClient.getRuntimeInfo.mockResolvedValue(mockRuntimeInfo);

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

    it('should use environment variables for configuration', () => {
      process.env.SSE_ENABLED = 'true';
      process.env.SSE_PORT = '3002';
      process.env.SSE_HEARTBEAT_INTERVAL = '15000';
      process.env.SSE_MAX_CONNECTIONS = '50';

      const server = new McpNodeRedServer();
      expect(server).toBeDefined();
    });
  });

  describe('Tool Definitions', () => {
    it('should return tool definitions', () => {
      const tools = mcpServer.getToolDefinitions();
      expect(tools).toBeDefined();
      expect(Array.isArray(tools)).toBe(true);
      expect(tools.length).toBeGreaterThan(0);
    });

    it('should include get_flows tool with correct schema', () => {
      const tools = mcpServer.getToolDefinitions();
      const getFlowsTool = tools.find(t => t.name === 'get_flows');

      expect(getFlowsTool).toBeDefined();
      expect(getFlowsTool?.description).toContain('Get Node-RED flows');
      expect(getFlowsTool?.inputSchema.properties).toHaveProperty('includeDetails');
      expect(getFlowsTool?.inputSchema.properties).toHaveProperty('types');
    });

    it('should include get_flow tool with required flowId', () => {
      const tools = mcpServer.getToolDefinitions();
      const getFlowTool = tools.find(t => t.name === 'get_flow');

      expect(getFlowTool).toBeDefined();
      expect(getFlowTool?.inputSchema.required).toContain('flowId');
    });

    it('should include create_flow tool with required flowData', () => {
      const tools = mcpServer.getToolDefinitions();
      const createFlowTool = tools.find(t => t.name === 'create_flow');

      expect(createFlowTool).toBeDefined();
      expect(createFlowTool?.inputSchema.required).toContain('flowData');
    });

    it('should include update_flow tool with required parameters', () => {
      const tools = mcpServer.getToolDefinitions();
      const updateFlowTool = tools.find(t => t.name === 'update_flow');

      expect(updateFlowTool).toBeDefined();
      expect(updateFlowTool?.inputSchema.required).toContain('flowId');
      expect(updateFlowTool?.inputSchema.required).toContain('flowData');
    });

    it('should include enable_flow tool', () => {
      const tools = mcpServer.getToolDefinitions();
      const enableFlowTool = tools.find(t => t.name === 'enable_flow');

      expect(enableFlowTool).toBeDefined();
      expect(enableFlowTool?.inputSchema.required).toContain('flowId');
    });

    it('should include disable_flow tool', () => {
      const tools = mcpServer.getToolDefinitions();
      const disableFlowTool = tools.find(t => t.name === 'disable_flow');

      expect(disableFlowTool).toBeDefined();
      expect(disableFlowTool?.inputSchema.required).toContain('flowId');
    });

    it('should include search_modules tool', () => {
      const tools = mcpServer.getToolDefinitions();
      const searchModulesTool = tools.find(t => t.name === 'search_modules');

      expect(searchModulesTool).toBeDefined();
      expect(searchModulesTool?.inputSchema.required).toContain('query');
      expect(searchModulesTool?.inputSchema.properties).toHaveProperty('category');
      expect(searchModulesTool?.inputSchema.properties).toHaveProperty('limit');
    });

    it('should include install_module tool', () => {
      const tools = mcpServer.getToolDefinitions();
      const installModuleTool = tools.find(t => t.name === 'install_module');

      expect(installModuleTool).toBeDefined();
      expect(installModuleTool?.inputSchema.required).toContain('moduleName');
    });

    it('should include get_installed_modules tool', () => {
      const tools = mcpServer.getToolDefinitions();
      const getInstalledTool = tools.find(t => t.name === 'get_installed_modules');

      expect(getInstalledTool).toBeDefined();
      expect(getInstalledTool?.inputSchema.required).toEqual([]);
    });

    it('should have exactly 9 tools defined', () => {
      const tools = mcpServer.getToolDefinitions();
      expect(tools.length).toBe(9);
    });
  });

  describe('Tool Execution - get_flows', () => {
    it('should return flow summaries by default', async () => {
      const result = await mcpServer.callTool('get_flows', {});

      expect(mockNodeRedClient.getFlowSummaries).toHaveBeenCalledWith(['tab', 'subflow']);
      expect(result.content).toBeDefined();
      expect(result.content[0].type).toBe('text');
    });

    it('should return full flows when includeDetails is true', async () => {
      const result = await mcpServer.callTool('get_flows', { includeDetails: true });

      expect(mockNodeRedClient.getFlows).toHaveBeenCalled();
      expect(mockNodeRedClient.getFlowSummaries).not.toHaveBeenCalled();
    });

    it('should pass custom types to getFlowSummaries', async () => {
      const result = await mcpServer.callTool('get_flows', { types: ['tab'] });

      expect(mockNodeRedClient.getFlowSummaries).toHaveBeenCalledWith(['tab']);
    });
  });

  describe('Tool Execution - get_flow', () => {
    it('should return specific flow', async () => {
      const result = await mcpServer.callTool('get_flow', { flowId: 'flow-1' });

      expect(mockNodeRedClient.getFlow).toHaveBeenCalledWith('flow-1');
      expect(result.content).toBeDefined();
    });

    it('should throw validation error when flowId is missing', async () => {
      const result = await mcpServer.callTool('get_flow', {});

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.success).toBe(false);
      expect(parsed.error).toContain('flowId');
    });
  });

  describe('Tool Execution - create_flow', () => {
    it('should create new flow', async () => {
      const flowData = { label: 'New Flow', nodes: [] };
      const result = await mcpServer.callTool('create_flow', { flowData });

      expect(mockNodeRedClient.createFlow).toHaveBeenCalledWith(flowData);
      expect(result.content[0].text).toContain('Flow created');
    });

    it('should throw validation error when flowData is missing', async () => {
      const result = await mcpServer.callTool('create_flow', {});

      expect(result.content[0].text).toContain('flowData');
    });
  });

  describe('Tool Execution - update_flow', () => {
    it('should update existing flow', async () => {
      const flowData = { label: 'Updated Flow' };
      const result = await mcpServer.callTool('update_flow', {
        flowId: 'flow-1',
        flowData,
      });

      expect(mockNodeRedClient.updateFlow).toHaveBeenCalledWith('flow-1', flowData);
      expect(result.content[0].text).toContain('updated successfully');
    });

    it('should throw validation error when required params missing', async () => {
      const result = await mcpServer.callTool('update_flow', { flowId: 'flow-1' });

      expect(result.content[0].text).toContain('flowData');
    });
  });

  describe('Tool Execution - enable_flow', () => {
    it('should enable a flow', async () => {
      const result = await mcpServer.callTool('enable_flow', { flowId: 'flow-1' });

      expect(mockNodeRedClient.enableFlow).toHaveBeenCalledWith('flow-1');
      expect(result.content[0].text).toContain('enabled');
    });
  });

  describe('Tool Execution - disable_flow', () => {
    it('should disable a flow', async () => {
      const result = await mcpServer.callTool('disable_flow', { flowId: 'flow-1' });

      expect(mockNodeRedClient.disableFlow).toHaveBeenCalledWith('flow-1');
      expect(result.content[0].text).toContain('disabled');
    });
  });

  describe('Tool Execution - search_modules', () => {
    it('should search for modules', async () => {
      const result = await mcpServer.callTool('search_modules', { query: 'mqtt' });

      expect(mockNodeRedClient.searchModules).toHaveBeenCalledWith('mqtt', 'all', 10);
      expect(result.content[0].text).toBeDefined();
    });

    it('should use custom category and limit', async () => {
      const result = await mcpServer.callTool('search_modules', {
        query: 'mqtt',
        category: 'contrib',
        limit: 5,
      });

      expect(mockNodeRedClient.searchModules).toHaveBeenCalledWith('mqtt', 'contrib', 5);
    });

    it('should throw validation error when query is missing', async () => {
      const result = await mcpServer.callTool('search_modules', {});

      expect(result.content[0].text).toContain('query');
    });
  });

  describe('Tool Execution - install_module', () => {
    it('should install a module', async () => {
      const result = await mcpServer.callTool('install_module', {
        moduleName: 'node-red-contrib-test',
      });

      expect(mockNodeRedClient.installModule).toHaveBeenCalledWith(
        'node-red-contrib-test',
        undefined
      );
    });

    it('should install a module with version', async () => {
      const result = await mcpServer.callTool('install_module', {
        moduleName: 'node-red-contrib-test',
        version: '1.0.0',
      });

      expect(mockNodeRedClient.installModule).toHaveBeenCalledWith(
        'node-red-contrib-test',
        '1.0.0'
      );
    });
  });

  describe('Tool Execution - get_installed_modules', () => {
    it('should return installed modules', async () => {
      const result = await mcpServer.callTool('get_installed_modules', {});

      expect(mockNodeRedClient.getInstalledModules).toHaveBeenCalled();
      expect(result.content[0].text).toBeDefined();
    });
  });

  describe('Tool Execution - Unknown Tool', () => {
    it('should handle unknown tool gracefully', async () => {
      const result = await mcpServer.callTool('unknown_tool', {});

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.success).toBe(false);
      expect(parsed.error).toContain('Unknown tool');
    });
  });

  describe('Tool Execution - Error Handling', () => {
    it('should handle errors in tool execution', async () => {
      mockNodeRedClient.getFlow.mockRejectedValueOnce(new Error('Connection failed'));

      const result = await mcpServer.callTool('get_flow', { flowId: 'flow-1' });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.success).toBe(false);
      expect(parsed.error).toContain('Connection failed');
      expect(parsed.timestamp).toBeDefined();
    });
  });

  describe('Resource Management', () => {
    it('should list resources', async () => {
      const result = await mcpServer.listResources();

      expect(result.resources).toBeDefined();
      expect(Array.isArray(result.resources)).toBe(true);
    });

    it('should include flow resources', async () => {
      const result = await mcpServer.listResources();

      const flowResource = result.resources.find((r: any) => r.uri.startsWith('flow://'));
      expect(flowResource).toBeDefined();
    });

    it('should include system resource', async () => {
      const result = await mcpServer.listResources();

      const systemResource = result.resources.find((r: any) => r.uri === 'system://runtime');
      expect(systemResource).toBeDefined();
      expect(systemResource?.mimeType).toBe('application/json');
    });

    it('should handle errors in resource listing gracefully', async () => {
      mockNodeRedClient.getFlows.mockRejectedValueOnce(new Error('Connection failed'));

      const result = await mcpServer.listResources();

      expect(result.resources).toEqual([]);
    });
  });

  describe('Resource Reading', () => {
    it('should read flow resource', async () => {
      const result = await mcpServer.readResource('flow://flow-1');

      expect(mockNodeRedClient.getFlow).toHaveBeenCalledWith('flow-1');
      expect(result.contents).toBeDefined();
      expect(result.contents[0]?.mimeType).toBe('application/json');
    });

    it('should read system resource', async () => {
      const result = await mcpServer.readResource('system://runtime');

      expect(mockNodeRedClient.getRuntimeInfo).toHaveBeenCalled();
      expect(result.contents).toBeDefined();
    });

    it('should throw error for unsupported protocol', async () => {
      await expect(mcpServer.readResource('unknown://something')).rejects.toThrow(
        /Unsupported resource protocol/
      );
    });

    it('should throw error when flow path is missing', async () => {
      await expect(mcpServer.readResource('flow://')).rejects.toThrow(/Flow path is required/);
    });
  });

  describe('Prompt Management', () => {
    it('should list prompts', async () => {
      const result = await mcpServer.listPrompts();

      expect(result.prompts).toBeDefined();
      expect(Array.isArray(result.prompts)).toBe(true);
      expect(result.prompts.length).toBeGreaterThan(0);
    });

    it('should include create_simple_flow prompt', async () => {
      const result = await mcpServer.listPrompts();

      const prompt = result.prompts.find((p: any) => p.name === 'create_simple_flow');
      expect(prompt).toBeDefined();
      expect(prompt?.description).toBeDefined();
    });

    it('should include debug_flow_issues prompt', async () => {
      const result = await mcpServer.listPrompts();

      const prompt = result.prompts.find((p: any) => p.name === 'debug_flow_issues');
      expect(prompt).toBeDefined();
    });

    it('should include optimize_flow_performance prompt', async () => {
      const result = await mcpServer.listPrompts();

      const prompt = result.prompts.find((p: any) => p.name === 'optimize_flow_performance');
      expect(prompt).toBeDefined();
    });

    it('should include flow_documentation prompt', async () => {
      const result = await mcpServer.listPrompts();

      const prompt = result.prompts.find((p: any) => p.name === 'flow_documentation');
      expect(prompt).toBeDefined();
    });
  });

  describe('Prompt Retrieval', () => {
    it('should get create_simple_flow prompt', async () => {
      const result = await mcpServer.getPromptPublic('create_simple_flow', {});

      expect(result.description).toBeDefined();
      expect(result.messages).toBeDefined();
      expect(result.messages[0]?.role).toBe('user');
    });

    it('should get debug_flow_issues prompt', async () => {
      const result = await mcpServer.getPromptPublic('debug_flow_issues', {});

      expect((result.messages[0]?.content as any)?.type).toBe('text');
    });

    it('should handle unknown prompt', async () => {
      const result = await mcpServer.getPromptPublic('unknown_prompt', {});

      expect((result.messages[0]?.content as any)?.text).toContain('not found');
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
      expect(mockSSEHandler.destroy).toHaveBeenCalled();
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

  describe('Public API Methods (HTTP)', () => {
    it('should expose listTools method', async () => {
      const result = await mcpServer.listTools();

      expect(result.tools).toBeDefined();
      expect(Array.isArray(result.tools)).toBe(true);
    });

    it('should expose callToolPublic method', async () => {
      const result = await mcpServer.callToolPublic('get_flows', {});

      expect(result.content).toBeDefined();
    });

    it('should expose listResources method', async () => {
      const result = await mcpServer.listResources();

      expect(result.resources).toBeDefined();
    });

    it('should expose readResource method', async () => {
      const result = await mcpServer.readResource('flow://flow-1');

      expect(result.contents).toBeDefined();
    });

    it('should expose listPrompts method', async () => {
      const result = await mcpServer.listPrompts();

      expect(result.prompts).toBeDefined();
    });

    it('should expose getPromptPublic method', async () => {
      const result = await mcpServer.getPromptPublic('create_simple_flow', {});

      expect(result.description).toBeDefined();
      expect(result.messages).toBeDefined();
    });
  });
});
