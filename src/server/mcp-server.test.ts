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
  mockFlowStatus,
} from '../../test/fixtures/flows.js';
import {
  mockSearchResult,
  mockInstallSuccess,
  mockInstalledModules,
  mockRuntimeInfo,
  mockSettings,
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
  getGlobalContext: vi.fn(),
  setGlobalContext: vi.fn(),
  deleteGlobalContext: vi.fn(),
  getFlowContext: vi.fn(),
  setFlowContext: vi.fn(),
  deleteFlow: vi.fn(),
  getFlowStatus: vi.fn(),
  getSettings: vi.fn(),
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
    mockNodeRedClient.getGlobalContext.mockResolvedValue({});
    mockNodeRedClient.setGlobalContext.mockResolvedValue(undefined);
    mockNodeRedClient.deleteGlobalContext.mockResolvedValue(undefined);
    mockNodeRedClient.getFlowContext.mockResolvedValue({});
    mockNodeRedClient.setFlowContext.mockResolvedValue(undefined);
    mockNodeRedClient.deleteFlow.mockResolvedValue(undefined);
    mockNodeRedClient.getFlowStatus.mockResolvedValue(mockFlowStatus);
    mockNodeRedClient.getSettings.mockResolvedValue(mockSettings);

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

    it('should include search_flows tool', () => {
      const tools = mcpServer.getToolDefinitions();
      const searchFlowsTool = tools.find(t => t.name === 'search_flows');

      expect(searchFlowsTool).toBeDefined();
      expect(searchFlowsTool?.annotations?.readOnlyHint).toBe(true);
      expect(searchFlowsTool?.inputSchema.properties).toHaveProperty('type');
      expect(searchFlowsTool?.inputSchema.properties).toHaveProperty('query');
      expect(searchFlowsTool?.inputSchema.properties).toHaveProperty('flowId');
    });

    it('should include validate_flow tool', () => {
      const tools = mcpServer.getToolDefinitions();
      const validateFlowTool = tools.find(t => t.name === 'validate_flow');

      expect(validateFlowTool).toBeDefined();
      expect(validateFlowTool?.annotations?.readOnlyHint).toBe(true);
      expect(validateFlowTool?.inputSchema.required).toContain('flowId');
    });

    it('should include get_flow_state tool', () => {
      const tools = mcpServer.getToolDefinitions();
      const tool = tools.find(t => t.name === 'get_flow_state');

      expect(tool).toBeDefined();
      expect(tool?.annotations?.readOnlyHint).toBe(true);
    });

    it('should include get_settings tool', () => {
      const tools = mcpServer.getToolDefinitions();
      const tool = tools.find(t => t.name === 'get_settings');

      expect(tool).toBeDefined();
      expect(tool?.annotations?.readOnlyHint).toBe(true);
    });

    it('should include get_runtime_info tool', () => {
      const tools = mcpServer.getToolDefinitions();
      const tool = tools.find(t => t.name === 'get_runtime_info');

      expect(tool).toBeDefined();
      expect(tool?.annotations?.readOnlyHint).toBe(true);
    });

    it('should have exactly 18 tools defined', () => {
      const tools = mcpServer.getToolDefinitions();
      expect(tools.length).toBe(18);
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

  describe('Tool Execution - get_context', () => {
    it('should return all global context keys when no key specified', async () => {
      mockNodeRedClient.getGlobalContext.mockResolvedValue({ counter: 1, flag: true });
      const result = await mcpServer.callTool('get_context', {});

      expect(mockNodeRedClient.getGlobalContext).toHaveBeenCalledWith(undefined);
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.success).toBe(true);
      expect(parsed.data).toEqual({ counter: 1, flag: true });
    });

    it('should return a single global context value when key is specified', async () => {
      mockNodeRedClient.getGlobalContext.mockResolvedValue(42);
      const result = await mcpServer.callTool('get_context', { key: 'counter' });

      expect(mockNodeRedClient.getGlobalContext).toHaveBeenCalledWith('counter');
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.success).toBe(true);
      expect(parsed.data).toBe(42);
    });

    it('should read flow context when scope is flow', async () => {
      mockNodeRedClient.getFlowContext.mockResolvedValue({ localVar: 'hello' });
      const result = await mcpServer.callTool('get_context', {
        scope: 'flow',
        flowId: 'flow-1',
      });

      expect(mockNodeRedClient.getFlowContext).toHaveBeenCalledWith('flow-1', undefined);
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.success).toBe(true);
    });

    it('should return validation error when scope is flow but flowId is missing', async () => {
      const result = await mcpServer.callTool('get_context', { scope: 'flow' });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.success).toBe(false);
      expect(parsed.error).toContain('flowId');
    });
  });

  describe('Tool Execution - set_context', () => {
    it('should write a global context variable', async () => {
      mockNodeRedClient.setGlobalContext.mockResolvedValue(undefined);
      const result = await mcpServer.callTool('set_context', { key: 'counter', value: 99 });

      expect(mockNodeRedClient.setGlobalContext).toHaveBeenCalledWith('counter', 99);
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.success).toBe(true);
      expect(parsed.data.key).toBe('counter');
    });

    it('should write a flow context variable', async () => {
      mockNodeRedClient.setFlowContext.mockResolvedValue(undefined);
      const result = await mcpServer.callTool('set_context', {
        scope: 'flow',
        flowId: 'flow-1',
        key: 'localVar',
        value: 'hello',
      });

      expect(mockNodeRedClient.setFlowContext).toHaveBeenCalledWith('flow-1', 'localVar', 'hello');
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.success).toBe(true);
    });

    it('should return validation error when key is missing', async () => {
      const result = await mcpServer.callTool('set_context', { value: 1 });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.success).toBe(false);
      expect(parsed.error).toContain('key');
    });

    it('should return validation error when value is missing', async () => {
      const result = await mcpServer.callTool('set_context', { key: 'x' });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.success).toBe(false);
      expect(parsed.error).toContain('value');
    });

    it('should return validation error when scope is flow but flowId is missing', async () => {
      const result = await mcpServer.callTool('set_context', {
        scope: 'flow',
        key: 'x',
        value: 1,
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.success).toBe(false);
      expect(parsed.error).toContain('flowId');
    });
  });

  describe('Tool Execution - delete_context', () => {
    it('should delete a global context key', async () => {
      mockNodeRedClient.deleteGlobalContext.mockResolvedValue(undefined);
      const result = await mcpServer.callTool('delete_context', { key: 'counter' });

      expect(mockNodeRedClient.deleteGlobalContext).toHaveBeenCalledWith('counter');
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.success).toBe(true);
      expect(parsed.data.key).toBe('counter');
    });

    it('should return validation error when key is missing', async () => {
      const result = await mcpServer.callTool('delete_context', {});

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.success).toBe(false);
      expect(parsed.error).toContain('key');
    });
  });

  describe('Tool Execution - search_flows', () => {
    const searchFlowsFixture = [
      {
        id: 'tab-1',
        type: 'tab',
        label: 'Main Flow',
        nodes: [
          { id: 'n1', type: 'inject', name: 'Trigger MQTT', z: 'tab-1' },
          { id: 'n2', type: 'mqtt out', name: 'Publish', topic: 'sensors/temp', z: 'tab-1' },
          { id: 'n3', type: 'function', name: 'Transform', func: 'return msg;', z: 'tab-1' },
        ],
      },
      {
        id: 'tab-2',
        type: 'tab',
        label: 'HTTP Flow',
        nodes: [
          { id: 'n4', type: 'http in', name: 'API Endpoint', url: '/api/data', z: 'tab-2' },
          { id: 'n5', type: 'http response', name: '', z: 'tab-2' },
        ],
      },
    ];

    beforeEach(() => {
      mockNodeRedClient.getFlows.mockResolvedValue(searchFlowsFixture);
    });

    it('should filter nodes by type (substring, case-insensitive)', async () => {
      const result = await mcpServer.callTool('search_flows', { type: 'mqtt' });
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed.success).toBe(true);
      expect(parsed.data.matches.every((m: any) => m.nodeType.toLowerCase().includes('mqtt'))).toBe(
        true
      );
      expect(parsed.data.total).toBe(1);
    });

    it('should filter nodes by query matching name', async () => {
      const result = await mcpServer.callTool('search_flows', { query: 'trigger' });
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed.success).toBe(true);
      expect(parsed.data.total).toBe(1);
      expect(parsed.data.matches[0].nodeName).toBe('Trigger MQTT');
    });

    it('should filter nodes by query matching a string property value', async () => {
      const result = await mcpServer.callTool('search_flows', { query: '/api/data' });
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed.success).toBe(true);
      expect(parsed.data.total).toBe(1);
      expect(parsed.data.matches[0].nodeId).toBe('n4');
    });

    it('should restrict search to a specific flowId', async () => {
      const result = await mcpServer.callTool('search_flows', { flowId: 'tab-2' });
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed.success).toBe(true);
      expect(parsed.data.matches.every((m: any) => m.flowId === 'tab-2')).toBe(true);
      expect(parsed.data.total).toBe(2);
    });

    it('should AND multiple criteria together', async () => {
      const result = await mcpServer.callTool('search_flows', { type: 'http', flowId: 'tab-2' });
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed.success).toBe(true);
      // Both http in and http response are in tab-2
      expect(parsed.data.total).toBe(2);
      expect(parsed.data.matches.every((m: any) => m.flowId === 'tab-2')).toBe(true);
    });

    it('should return error when no search parameters provided', async () => {
      const result = await mcpServer.callTool('search_flows', {});
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed.success).toBe(false);
      expect(parsed.error).toContain('At least one search parameter is required');
    });

    it('should include nodeId, nodeType, nodeName, flowId, flowLabel in results', async () => {
      const result = await mcpServer.callTool('search_flows', { type: 'inject' });
      const parsed = JSON.parse(result.content[0].text);

      const match = parsed.data.matches[0];
      expect(match).toHaveProperty('nodeId');
      expect(match).toHaveProperty('nodeType');
      expect(match).toHaveProperty('nodeName');
      expect(match).toHaveProperty('flowId');
      expect(match).toHaveProperty('flowLabel');
    });

    it('should cap results at 10 and report full total', async () => {
      const manyNodes = Array.from({ length: 15 }, (_, i) => ({
        id: `fn-${i}`,
        type: 'function',
        name: `Func ${i}`,
        z: 'tab-1',
      }));
      mockNodeRedClient.getFlows.mockResolvedValue([
        { id: 'tab-1', type: 'tab', label: 'Big Flow', nodes: manyNodes },
      ]);

      const result = await mcpServer.callTool('search_flows', { type: 'function' });
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed.data.matches.length).toBe(10);
      expect(parsed.data.total).toBe(15);
    });
  });

  describe('Tool Execution - validate_flow', () => {
    it('should return valid:true for a structurally correct flow', async () => {
      const result = await mcpServer.callTool('validate_flow', { flowId: 'flow-1' });
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed.success).toBe(true);
      expect(parsed.data.valid).toBe(true);
      expect(parsed.data.errors).toEqual([]);
    });

    it('should detect duplicate node IDs', async () => {
      mockNodeRedClient.getFlow.mockResolvedValueOnce({
        id: 'flow-dup',
        nodes: [
          { id: 'n1', type: 'inject' },
          { id: 'n1', type: 'debug' },
        ],
      });

      const result = await mcpServer.callTool('validate_flow', { flowId: 'flow-dup' });
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed.data.valid).toBe(false);
      expect(parsed.data.errors.some((e: string) => e.includes('Duplicate'))).toBe(true);
    });

    it('should detect missing required fields', async () => {
      mockNodeRedClient.getFlow.mockResolvedValueOnce({
        id: 'flow-missing',
        nodes: [{ type: 'inject' }, { id: 'n2' }],
      });

      const result = await mcpServer.callTool('validate_flow', { flowId: 'flow-missing' });
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed.data.valid).toBe(false);
      expect(parsed.data.errors.some((e: string) => e.includes('"id"'))).toBe(true);
      expect(parsed.data.errors.some((e: string) => e.includes('"type"'))).toBe(true);
    });

    it('should detect dangling wire references', async () => {
      mockNodeRedClient.getFlow.mockResolvedValueOnce({
        id: 'flow-wire',
        nodes: [{ id: 'n1', type: 'inject', wires: [['n-nonexistent']] }],
      });

      const result = await mcpServer.callTool('validate_flow', { flowId: 'flow-wire' });
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed.data.valid).toBe(false);
      expect(parsed.data.errors.some((e: string) => e.includes('n-nonexistent'))).toBe(true);
    });

    it('should return validation error when flowId is missing', async () => {
      const result = await mcpServer.callTool('validate_flow', {});
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed.success).toBe(false);
      expect(parsed.error).toContain('flowId');
    });
  });

  describe('Tool Execution - create_flow with validate flag', () => {
    it('should create flow without validation when validate is false', async () => {
      const flowData = { label: 'New Flow', nodes: [] };
      const result = await mcpServer.callTool('create_flow', { flowData, validate: false });

      expect(mockNodeRedClient.createFlow).toHaveBeenCalledWith(flowData);
      expect(result.content[0].text).toContain('Flow created');
    });

    it('should block create when validate:true and flowData has errors', async () => {
      const flowData = {
        nodes: [{ id: 'n1', type: 'inject', wires: [['n-ghost']] }],
      };
      const result = await mcpServer.callTool('create_flow', { flowData, validate: true });
      const parsed = JSON.parse(result.content[0].text);

      expect(mockNodeRedClient.createFlow).not.toHaveBeenCalled();
      expect(parsed.success).toBe(false);
      expect(parsed.error).toContain('Validation failed');
    });

    it('should create flow when validate:true and flowData is valid', async () => {
      const flowData = {
        label: 'Good Flow',
        nodes: [
          { id: 'n1', type: 'inject', wires: [['n2']] },
          { id: 'n2', type: 'debug', wires: [] },
        ],
      };
      const result = await mcpServer.callTool('create_flow', { flowData, validate: true });

      expect(mockNodeRedClient.createFlow).toHaveBeenCalledWith(flowData);
      expect(result.content[0].text).toContain('Flow created');
    });
  });

  describe('Tool Execution - update_flow with validate flag', () => {
    it('should block update when validate:true and flowData has duplicate IDs', async () => {
      const flowData = {
        nodes: [
          { id: 'dup', type: 'inject' },
          { id: 'dup', type: 'debug' },
        ],
      };
      const result = await mcpServer.callTool('update_flow', {
        flowId: 'flow-1',
        flowData,
        validate: true,
      });
      const parsed = JSON.parse(result.content[0].text);

      expect(mockNodeRedClient.updateFlow).not.toHaveBeenCalled();
      expect(parsed.success).toBe(false);
      expect(parsed.error).toContain('Validation failed');
    });

    it('should update flow when validate:true and flowData is valid', async () => {
      const flowData = {
        nodes: [{ id: 'n1', type: 'inject' }],
      };
      const result = await mcpServer.callTool('update_flow', {
        flowId: 'flow-1',
        flowData,
        validate: true,
      });

      expect(mockNodeRedClient.updateFlow).toHaveBeenCalledWith('flow-1', flowData);
      expect(result.content[0].text).toContain('updated successfully');
    });
  });

  describe('Tool Execution - delete_flow', () => {
    it('should return flow info without deleting when dryRun is true (default)', async () => {
      const result = await mcpServer.callTool('delete_flow', { flowId: 'flow-1' });
      const parsed = JSON.parse(result.content[0].text);

      expect(mockNodeRedClient.getFlow).toHaveBeenCalledWith('flow-1');
      expect(mockNodeRedClient.deleteFlow).not.toHaveBeenCalled();
      expect(parsed.success).toBe(true);
      expect(parsed.data.dryRun).toBe(true);
      expect(parsed.data.wouldDelete).toEqual({ id: 'flow-1', label: 'Test Flow', nodeCount: 2 });
    });

    it('should delete flow when dryRun is false and confirm is true', async () => {
      const result = await mcpServer.callTool('delete_flow', {
        flowId: 'flow-1',
        dryRun: false,
        confirm: true,
      });
      const parsed = JSON.parse(result.content[0].text);

      expect(mockNodeRedClient.getFlow).toHaveBeenCalledWith('flow-1');
      expect(mockNodeRedClient.deleteFlow).toHaveBeenCalledWith('flow-1');
      expect(parsed.success).toBe(true);
      expect(parsed.data.deleted).toEqual({ id: 'flow-1', label: 'Test Flow', nodeCount: 2 });
    });

    it('should return error when dryRun is false but confirm is missing', async () => {
      const result = await mcpServer.callTool('delete_flow', {
        flowId: 'flow-1',
        dryRun: false,
      });
      const parsed = JSON.parse(result.content[0].text);

      expect(mockNodeRedClient.deleteFlow).not.toHaveBeenCalled();
      expect(parsed.success).toBe(false);
      expect(parsed.error).toContain('confirm');
    });

    it('should return validation error when flowId is missing', async () => {
      const result = await mcpServer.callTool('delete_flow', {});
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed.success).toBe(false);
      expect(parsed.error).toContain('flowId');
    });

    it('should have destructiveHint annotation', () => {
      const tools = mcpServer.getToolDefinitions();
      const deleteFlowTool = tools.find(t => t.name === 'delete_flow');

      expect(deleteFlowTool).toBeDefined();
      expect(deleteFlowTool?.annotations?.destructiveHint).toBe(true);
      expect(deleteFlowTool?.annotations?.readOnlyHint).toBe(false);
    });
  });

  describe('Tool Execution - get_flow_state', () => {
    it('should return flow state', async () => {
      const result = await mcpServer.callTool('get_flow_state', {});
      const parsed = JSON.parse(result.content[0].text);

      expect(mockNodeRedClient.getFlowStatus).toHaveBeenCalled();
      expect(parsed.success).toBe(true);
      expect(parsed.data.state).toBe('start');
      expect(Array.isArray(parsed.data.flows)).toBe(true);
    });

    it('should propagate API errors', async () => {
      mockNodeRedClient.getFlowStatus.mockRejectedValueOnce(new Error('Connection refused'));
      const result = await mcpServer.callTool('get_flow_state', {});
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed.success).toBe(false);
      expect(parsed.error).toContain('Connection refused');
    });
  });

  describe('Tool Execution - get_settings', () => {
    it('should return runtime settings', async () => {
      const result = await mcpServer.callTool('get_settings', {});
      const parsed = JSON.parse(result.content[0].text);

      expect(mockNodeRedClient.getSettings).toHaveBeenCalled();
      expect(parsed.success).toBe(true);
      expect(parsed.data).toHaveProperty('httpNodeRoot');
    });

    it('should propagate API errors', async () => {
      mockNodeRedClient.getSettings.mockRejectedValueOnce(new Error('Unauthorized'));
      const result = await mcpServer.callTool('get_settings', {});
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed.success).toBe(false);
      expect(parsed.error).toContain('Unauthorized');
    });
  });

  describe('Tool Execution - get_runtime_info', () => {
    it('should return runtime info', async () => {
      const result = await mcpServer.callTool('get_runtime_info', {});
      const parsed = JSON.parse(result.content[0].text);

      expect(mockNodeRedClient.getRuntimeInfo).toHaveBeenCalled();
      expect(parsed.success).toBe(true);
      expect(parsed.data.version).toBe('3.1.0');
      expect(parsed.data).toHaveProperty('memory');
    });

    it('should propagate API errors', async () => {
      mockNodeRedClient.getRuntimeInfo.mockRejectedValueOnce(new Error('Service unavailable'));
      const result = await mcpServer.callTool('get_runtime_info', {});
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed.success).toBe(false);
      expect(parsed.error).toContain('Service unavailable');
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

      // Static collection resources are always present even when the API errors
      expect(result.resources.find((r: any) => r.uri === 'nodered://flows')).toBeDefined();
      // Individual flow:// entries are absent when getFlows() fails
      expect(result.resources.find((r: any) => r.uri.startsWith('flow://'))).toBeUndefined();
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

  describe('Resource Management - nodered:// collection resources', () => {
    it('should include all nodered:// collection resources in resource list', async () => {
      const { resources } = await mcpServer.listResources();
      const uris = resources.map((r: any) => r.uri);
      expect(uris).toContain('nodered://flows');
      expect(uris).toContain('nodered://subflows');
      expect(uris).toContain('nodered://nodes');
      expect(uris).toContain('nodered://context/global');
      expect(resources.find((r: any) => r.uri === 'nodered://flows')?.mimeType).toBe('application/json');
    });

    it('should read nodered://flows and return summary envelope', async () => {
      const result = await mcpServer.readResource('nodered://flows');
      expect(result.contents).toHaveLength(1);
      const parsed = JSON.parse(result.contents[0]!.text);
      expect(parsed.uri).toBe('nodered://flows');
      expect(Array.isArray(parsed.items)).toBe(true);
      expect(parsed.metadata.count).toBe(parsed.items.length);
      expect(mockNodeRedClient.getFlowSummaries).toHaveBeenCalledWith(['tab']);
    });

    it('should read nodered://subflows and return summary envelope', async () => {
      const result = await mcpServer.readResource('nodered://subflows');
      const parsed = JSON.parse(result.contents[0]!.text);
      expect(parsed.uri).toBe('nodered://subflows');
      expect(Array.isArray(parsed.items)).toBe(true);
      expect(mockNodeRedClient.getFlowSummaries).toHaveBeenCalledWith(['subflow']);
    });

    it('should read nodered://nodes and return modules envelope', async () => {
      const result = await mcpServer.readResource('nodered://nodes');
      const parsed = JSON.parse(result.contents[0]!.text);
      expect(parsed.uri).toBe('nodered://nodes');
      expect(Array.isArray(parsed.items)).toBe(true);
      expect(parsed.metadata.count).toBe(parsed.items.length);
      expect(mockNodeRedClient.getInstalledModules).toHaveBeenCalled();
    });

    it('should read nodered://context/global and return context data', async () => {
      mockNodeRedClient.getGlobalContext.mockResolvedValueOnce({ temperature: 23, armed: false });
      const result = await mcpServer.readResource('nodered://context/global');
      const parsed = JSON.parse(result.contents[0]!.text);
      expect(parsed.uri).toBe('nodered://context/global');
      expect(parsed.data).toEqual({ temperature: 23, armed: false });
      expect(parsed.metadata.timestamp).toBeDefined();
    });

    it('should throw for unknown nodered:// path', async () => {
      await expect(mcpServer.readResource('nodered://unknown')).rejects.toThrow(
        /Unsupported nodered resource path/
      );
    });
  });

  describe('Prompt Management', () => {
    it('should list prompts', async () => {
      const result = await mcpServer.listPrompts();

      expect(result.prompts).toBeDefined();
      expect(Array.isArray(result.prompts)).toBe(true);
      expect(result.prompts.length).toBeGreaterThan(0);
    });

    it('should include debug_flow prompt', async () => {
      const result = await mcpServer.listPrompts();

      const prompt = result.prompts.find((p: any) => p.name === 'debug_flow');
      expect(prompt).toBeDefined();
      expect(prompt?.description).toBeDefined();
    });

    it('should include explain_automation prompt', async () => {
      const result = await mcpServer.listPrompts();

      const prompt = result.prompts.find((p: any) => p.name === 'explain_automation');
      expect(prompt).toBeDefined();
    });

    it('should include audit_security prompt', async () => {
      const result = await mcpServer.listPrompts();

      const prompt = result.prompts.find((p: any) => p.name === 'audit_security');
      expect(prompt).toBeDefined();
    });

    it('should include document_flow prompt', async () => {
      const result = await mcpServer.listPrompts();

      const prompt = result.prompts.find((p: any) => p.name === 'document_flow');
      expect(prompt).toBeDefined();
    });
  });

  describe('Prompt Retrieval', () => {
    it('should get debug_flow prompt', async () => {
      const result = await mcpServer.getPromptPublic('debug_flow', { flowId: 'flow-1' });

      expect(result.description).toBeDefined();
      expect(result.messages).toBeDefined();
      expect(result.messages[0]?.role).toBe('user');
    });

    it('should get explain_automation prompt', async () => {
      const result = await mcpServer.getPromptPublic('explain_automation', { flowId: 'flow-1' });

      expect((result.messages[0]?.content as any)?.type).toBe('text');
    });

    it('should throw PromptNotFoundError for unknown prompt', async () => {
      await expect(mcpServer.getPromptPublic('unknown_prompt', {})).rejects.toThrow(/not found/);
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
      const result = await mcpServer.getPromptPublic('debug_flow', { flowId: 'flow-1' });

      expect(result.description).toBeDefined();
      expect(result.messages).toBeDefined();
    });
  });
});
