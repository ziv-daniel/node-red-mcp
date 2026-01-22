/**
 * MCP Protocol Integration Tests
 * High-level tests for MCP server tool workflows
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { mockFlows, mockFlowTab, mockCreatedFlow } from '../fixtures/flows.js';
import {
  mockSettings,
  mockRuntimeInfo,
  mockInstalledModules,
  mockSearchResult,
  mockInstallSuccess,
} from '../fixtures/responses.js';

// Use vi.hoisted to ensure mock objects are created before vi.mock runs
const { mockNodeRedClient, mockSSEHandler } = vi.hoisted(() => ({
  mockNodeRedClient: {
    getFlows: vi.fn(),
    getFlowSummaries: vi.fn(),
    getFlow: vi.fn(),
    createFlow: vi.fn(),
    updateFlow: vi.fn(),
    deleteFlow: vi.fn(),
    enableFlow: vi.fn(),
    disableFlow: vi.fn(),
    getSettings: vi.fn(),
    getRuntimeInfo: vi.fn(),
    getInstalledModules: vi.fn(),
    searchModules: vi.fn(),
    installModule: vi.fn(),
    testConnection: vi.fn(),
  },
  mockSSEHandler: {
    start: vi.fn(),
    stop: vi.fn(),
    broadcast: vi.fn(),
    destroy: vi.fn(),
  },
}));

// Mock NodeRedAPIClient
vi.mock('../../src/services/nodered-api.js', () => ({
  NodeRedAPIClient: class {
    constructor() {
      return mockNodeRedClient;
    }
  },
}));

// Mock SSEHandler
vi.mock('../../src/server/sse-handler.js', () => ({
  SSEHandler: class {
    constructor() {
      return mockSSEHandler;
    }
  },
}));

// Mock MCP SDK Server
vi.mock('@modelcontextprotocol/sdk/server/index.js', () => ({
  Server: class {
    handlers = new Map();
    setRequestHandler = vi.fn((schema: any, handler: any) => {
      this.handlers.set(schema, handler);
    });
    connect = vi.fn();
  },
}));

// Import after mocks are set up
import { McpNodeRedServer } from '../../src/server/mcp-server.js';

describe('MCP Protocol Integration', () => {
  let mcpServer: McpNodeRedServer;

  beforeEach(() => {
    vi.clearAllMocks();

    // Set up mock return values
    mockNodeRedClient.getFlows.mockResolvedValue(mockFlows);
    mockNodeRedClient.getFlowSummaries.mockResolvedValue([]);
    mockNodeRedClient.getFlow.mockResolvedValue(mockFlowTab);
    mockNodeRedClient.createFlow.mockResolvedValue(mockCreatedFlow);
    mockNodeRedClient.updateFlow.mockResolvedValue(mockFlowTab);
    mockNodeRedClient.deleteFlow.mockResolvedValue(undefined);
    mockNodeRedClient.enableFlow.mockResolvedValue(undefined);
    mockNodeRedClient.disableFlow.mockResolvedValue(undefined);
    mockNodeRedClient.getSettings.mockResolvedValue(mockSettings);
    mockNodeRedClient.getRuntimeInfo.mockResolvedValue(mockRuntimeInfo);
    mockNodeRedClient.getInstalledModules.mockResolvedValue(mockInstalledModules);
    mockNodeRedClient.searchModules.mockResolvedValue(mockSearchResult);
    mockNodeRedClient.installModule.mockResolvedValue(mockInstallSuccess);
    mockNodeRedClient.testConnection.mockResolvedValue(true);

    mcpServer = new McpNodeRedServer({
      name: 'test-mcp-server',
      version: '1.0.0',
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Server Initialization', () => {
    it('should create server instance', () => {
      expect(mcpServer).toBeDefined();
    });

    it('should expose NodeRed client', () => {
      expect(mcpServer.getNodeRedClient()).toBe(mockNodeRedClient);
    });

    it('should expose SSE handler', () => {
      expect(mcpServer.getSSEHandler()).toBe(mockSSEHandler);
    });

    it('should expose MCP server', () => {
      expect(mcpServer.getServer()).toBeDefined();
    });
  });

  describe('Tool Execution via callTool', () => {
    describe('get_flows', () => {
      it('should retrieve flow summaries by default', async () => {
        const result = await mcpServer.callTool('get_flows', {});

        expect(result.content).toBeDefined();
        expect(result.content[0].type).toBe('text');
        // Default behavior calls getFlowSummaries, not getFlows
        expect(mockNodeRedClient.getFlowSummaries).toHaveBeenCalled();
      });

      it('should retrieve all flow details when includeDetails is true', async () => {
        const result = await mcpServer.callTool('get_flows', { includeDetails: true });

        expect(result.content).toBeDefined();
        expect(result.content[0].type).toBe('text');
        expect(mockNodeRedClient.getFlows).toHaveBeenCalled();
      });
    });

    describe('get_flow', () => {
      it('should retrieve specific flow by ID', async () => {
        const result = await mcpServer.callTool('get_flow', { flowId: 'flow-1' });

        expect(result.content).toBeDefined();
        expect(mockNodeRedClient.getFlow).toHaveBeenCalledWith('flow-1');
      });
    });

    describe('create_flow', () => {
      it('should create new flow with flowData', async () => {
        const result = await mcpServer.callTool('create_flow', {
          flowData: {
            label: 'Test Flow',
            nodes: [],
          },
        });

        expect(result.content).toBeDefined();
        expect(mockNodeRedClient.createFlow).toHaveBeenCalled();
      });
    });

    describe('enable_flow', () => {
      it('should enable a flow', async () => {
        const result = await mcpServer.callTool('enable_flow', {
          flowId: 'flow-disabled',
        });

        expect(result.content).toBeDefined();
        expect(mockNodeRedClient.enableFlow).toHaveBeenCalledWith('flow-disabled');
      });
    });

    describe('disable_flow', () => {
      it('should disable a flow', async () => {
        const result = await mcpServer.callTool('disable_flow', {
          flowId: 'flow-1',
        });

        expect(result.content).toBeDefined();
        expect(mockNodeRedClient.disableFlow).toHaveBeenCalledWith('flow-1');
      });
    });

    describe('search_modules', () => {
      it('should search for modules with query', async () => {
        const result = await mcpServer.callTool('search_modules', {
          query: 'influxdb',
        });

        expect(result.content).toBeDefined();
        expect(mockNodeRedClient.searchModules).toHaveBeenCalled();
        // Verify first arg is query
        expect(mockNodeRedClient.searchModules.mock.calls[0][0]).toBe('influxdb');
      });
    });

    describe('install_module', () => {
      it('should install module by name', async () => {
        const result = await mcpServer.callTool('install_module', {
          moduleName: 'node-red-contrib-test',
        });

        expect(result.content).toBeDefined();
        expect(mockNodeRedClient.installModule).toHaveBeenCalled();
      });
    });

    describe('get_installed_modules', () => {
      it('should list installed modules', async () => {
        const result = await mcpServer.callTool('get_installed_modules', {});

        expect(result.content).toBeDefined();
        expect(mockNodeRedClient.getInstalledModules).toHaveBeenCalled();
      });
    });
  });

  describe('Tool Definitions', () => {
    it('should return tool definitions array', () => {
      const tools = mcpServer.getToolDefinitions();

      expect(tools).toBeInstanceOf(Array);
      expect(tools.length).toBeGreaterThan(0);
    });

    it('should have tools with required properties', () => {
      const tools = mcpServer.getToolDefinitions();

      for (const tool of tools) {
        expect(tool).toHaveProperty('name');
        expect(tool).toHaveProperty('description');
        expect(tool).toHaveProperty('inputSchema');
      }
    });

    it('should include flow management tools', () => {
      const tools = mcpServer.getToolDefinitions();
      const toolNames = tools.map((t) => t.name);

      expect(toolNames).toContain('get_flows');
      expect(toolNames).toContain('get_flow');
      expect(toolNames).toContain('create_flow');
    });

    it('should include module management tools', () => {
      const tools = mcpServer.getToolDefinitions();
      const toolNames = tools.map((t) => t.name);

      expect(toolNames).toContain('search_modules');
      expect(toolNames).toContain('install_module');
      expect(toolNames).toContain('get_installed_modules');
    });
  });

  describe('Complete Workflows', () => {
    it('should support create flow workflow', async () => {
      const createResult = await mcpServer.callTool('create_flow', {
        flowData: {
          label: 'Test Flow',
          nodes: [],
        },
      });
      expect(createResult.content).toBeDefined();
    });

    it('should support enable and disable workflow', async () => {
      // Disable
      const disableResult = await mcpServer.callTool('disable_flow', {
        flowId: 'flow-1',
      });
      expect(disableResult.content).toBeDefined();

      // Enable
      const enableResult = await mcpServer.callTool('enable_flow', {
        flowId: 'flow-1',
      });
      expect(enableResult.content).toBeDefined();
    });

    it('should support module management workflow', async () => {
      // Search
      const searchResult = await mcpServer.callTool('search_modules', {
        query: 'mqtt',
      });
      expect(searchResult.content).toBeDefined();

      // Install
      const installResult = await mcpServer.callTool('install_module', {
        moduleName: 'node-red-contrib-mqtt',
      });
      expect(installResult.content).toBeDefined();

      // List
      const modulesResult = await mcpServer.callTool('get_installed_modules', {});
      expect(modulesResult.content).toBeDefined();
    });
  });

  describe('Result Format', () => {
    it('should return content array with text type', async () => {
      const result = await mcpServer.callTool('get_flows', {});

      expect(result.content).toBeInstanceOf(Array);
      expect(result.content.length).toBeGreaterThan(0);
      expect(result.content[0]).toHaveProperty('type', 'text');
      expect(result.content[0]).toHaveProperty('text');
    });

    it('should return parseable JSON in text content', async () => {
      const result = await mcpServer.callTool('get_flows', {});

      const textContent = result.content[0].text as string;
      expect(() => JSON.parse(textContent)).not.toThrow();
    });
  });
});
