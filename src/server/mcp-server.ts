/**
 * Main MCP Server implementation for Node-RED integration
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ListPromptsRequestSchema,
  CallToolRequestSchema,
  ReadResourceRequestSchema,
  GetPromptRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

import { NodeRedAPIClient } from '../services/nodered-api.js';
import {
  McpServerConfig,
  McpToolResult,
  FlowManagementToolParams,
  NodeManagementToolParams,
  MonitoringToolParams,
  NodeRedFlowResource,
  NodeRedSystemResource,
  NodeRedSSEResource,
  NodeRedPromptTemplate,
} from '../types/mcp-extensions.js';
import { validateRequired, validateTypes } from '../utils/error-handling.js';

import { SSEHandler } from './sse-handler.js';

export class McpNodeRedServer {
  private server: Server;
  private nodeRedClient: NodeRedAPIClient;
  private sseHandler: SSEHandler;
  private config: McpServerConfig;

  constructor(config: Partial<McpServerConfig> = {}) {
    this.config = {
      name: process.env.MCP_SERVER_NAME || 'nodered-mcp-server',
      version: process.env.MCP_SERVER_VERSION || '1.0.0',
      capabilities: {
        tools: true,
        resources: true,
        prompts: true,
        logging: true,
      },
      nodeRed: {
        url: process.env.NODERED_URL || 'http://localhost:1880',
        timeout: parseInt(process.env.NODERED_TIMEOUT || '5000'),
        retries: parseInt(process.env.NODERED_RETRIES || '3'),
      },
      sse: {
        enabled: process.env.SSE_ENABLED !== 'false',
        port: parseInt(process.env.SSE_PORT || '3001'),
        heartbeatInterval: parseInt(
          process.env.SSE_HEARTBEAT_INTERVAL || '30000',
        ),
        maxConnections: parseInt(process.env.SSE_MAX_CONNECTIONS || '100'),
      },
      ...config,
    };

    this.server = new Server(
      {
        name: this.config.name,
        version: this.config.version,
      },
      {
        capabilities: {
          tools: this.config.capabilities.tools ? {} : undefined,
          resources: this.config.capabilities.resources ? {} : undefined,
          prompts: this.config.capabilities.prompts ? {} : undefined,
          logging: this.config.capabilities.logging ? {} : undefined,
        },
      },
    );

    this.nodeRedClient = new NodeRedAPIClient(this.config.nodeRed);
    this.sseHandler = new SSEHandler(this.config.sse);

    this.setupHandlers();
  }

  /**
   * Setup MCP request handlers
   */
  private setupHandlers(): void {
    // Tools handlers
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: this.getToolDefinitions(),
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;
      return await this.callTool(name, args || {});
    });

    // Resources handlers
    this.server.setRequestHandler(ListResourcesRequestSchema, async () => ({
      resources: await this.getResourceList(),
    }));

    this.server.setRequestHandler(
      ReadResourceRequestSchema,
      async (request) => {
        const { uri } = request.params;
        return await this.getResource(uri);
      },
    );

    // Prompts handlers
    this.server.setRequestHandler(ListPromptsRequestSchema, async () => ({
      prompts: this.getPromptDefinitions(),
    }));

    this.server.setRequestHandler(GetPromptRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;
      return await this.getPrompt(name, args || {});
    });
  }

  /**
   * Get tool definitions
   */
  private getToolDefinitions() {
    return [
      // Core Flow Management Tools (Optimized)
      {
        name: 'get_flows',
        description:
          'Get Node-RED flows with flexible filtering (summary info by default, use includeDetails for full data)',
        inputSchema: {
          type: 'object',
          properties: {
            includeDetails: {
              type: 'boolean',
              description:
                'Include full flow details with nodes (default: false for token efficiency)',
              default: false,
            },
            types: {
              type: 'array',
              items: { type: 'string' },
              description:
                'Flow types to include (default: ["tab", "subflow"]). Options: "tab" (main flows), "subflow" (reusable subflows)',
              default: ['tab', 'subflow'],
            },
          },
          required: [],
        },
      },
      {
        name: 'get_flow',
        description: 'Get specific Node-RED flow by ID',
        inputSchema: {
          type: 'object',
          properties: {
            flowId: { type: 'string', description: 'Flow ID to retrieve' },
          },
          required: ['flowId'],
        },
      },
      {
        name: 'create_flow',
        description: 'Create a new Node-RED flow',
        inputSchema: {
          type: 'object',
          properties: {
            flowData: {
              type: 'object',
              description: 'Flow configuration data',
              properties: {
                label: { type: 'string' },
                nodes: { type: 'array' },
                disabled: { type: 'boolean' },
              },
            },
          },
          required: ['flowData'],
        },
      },
      {
        name: 'update_flow',
        description: 'Update an existing Node-RED flow',
        inputSchema: {
          type: 'object',
          properties: {
            flowId: { type: 'string', description: 'Flow ID to update' },
            flowData: { type: 'object', description: 'Updated flow data' },
          },
          required: ['flowId', 'flowData'],
        },
      },
      {
        name: 'enable_flow',
        description: 'Enable a specific Node-RED flow',
        inputSchema: {
          type: 'object',
          properties: {
            flowId: { type: 'string', description: 'Flow ID to enable' },
          },
          required: ['flowId'],
        },
      },
      {
        name: 'disable_flow',
        description: 'Disable a specific Node-RED flow',
        inputSchema: {
          type: 'object',
          properties: {
            flowId: { type: 'string', description: 'Flow ID to disable' },
          },
          required: ['flowId'],
        },
      },
      {
        name: 'search_modules',
        description:
          'Search for Node-RED palette modules online via npm registry',
        inputSchema: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description:
                'Search query for modules (e.g., "mqtt", "dashboard", "influxdb")',
            },
            category: {
              type: 'string',
              enum: ['all', 'contrib', 'dashboard'],
              description: 'Module category to search (default: all)',
              default: 'all',
            },
            limit: {
              type: 'number',
              description: 'Maximum number of results to return (default: 10)',
              default: 10,
              minimum: 1,
              maximum: 50,
            },
          },
          required: ['query'],
        },
      },
      {
        name: 'install_module',
        description:
          'Install a Node-RED palette module via Node-RED palette management API',
        inputSchema: {
          type: 'object',
          properties: {
            moduleName: {
              type: 'string',
              description:
                'Name of the module to install (e.g., "node-red-contrib-ui-led")',
            },
            version: {
              type: 'string',
              description:
                'Specific version to install (optional, defaults to latest)',
            },
          },
          required: ['moduleName'],
        },
      },
      {
        name: 'get_installed_modules',
        description: 'Get list of currently installed Node-RED palette modules',
        inputSchema: {
          type: 'object',
          properties: {},
          required: [],
        },
      },
    ];
  }

  /**
   * Call a specific tool
   */
  private async callTool(name: string, args: any): Promise<{ content: any[] }> {
    const timestamp = new Date().toISOString();
    let result: McpToolResult;

    try {
      switch (name) {
        // Core Flow Management Tools
        case 'get_flows':
          const includeDetails = args?.includeDetails || false;
          const types = args?.types || ['tab', 'subflow'];
          const flowData = includeDetails
            ? await this.nodeRedClient.getFlows()
            : await this.nodeRedClient.getFlowSummaries(types);

          result = {
            success: true,
            data: flowData,
            timestamp,
          };
          break;

        case 'get_flow':
          validateRequired(args, ['flowId']);
          result = {
            success: true,
            data: await this.nodeRedClient.getFlow(args.flowId),
            timestamp,
          };
          break;

        case 'create_flow':
          validateRequired(args, ['flowData']);
          const createdFlow = await this.nodeRedClient.createFlow(
            args.flowData,
          );
          return {
            content: [
              {
                type: 'text',
                text: `Flow created: ${createdFlow.id || createdFlow.label}`,
              },
            ],
          };

        case 'update_flow':
          validateRequired(args, ['flowId', 'flowData']);
          await this.nodeRedClient.updateFlow(args.flowId, args.flowData);
          return {
            content: [
              {
                type: 'text',
                text: `Flow ${args.flowId} updated successfully`,
              },
            ],
          };

        case 'enable_flow':
          validateRequired(args, ['flowId']);
          await this.nodeRedClient.enableFlow(args.flowId);
          return {
            content: [
              {
                type: 'text',
                text: `Flow ${args.flowId} enabled`,
              },
            ],
          };

        case 'disable_flow':
          validateRequired(args, ['flowId']);
          await this.nodeRedClient.disableFlow(args.flowId);
          return {
            content: [
              {
                type: 'text',
                text: `Flow ${args.flowId} disabled`,
              },
            ],
          };

        case 'search_modules':
          validateRequired(args, ['query']);
          const searchQuery = args.query;
          const searchCategory = args.category || 'all';
          const searchLimit = args.limit || 10;
          const searchResults = await this.nodeRedClient.searchModules(
            searchQuery,
            searchCategory,
            searchLimit,
          );
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(searchResults, null, 2),
              },
            ],
          };

        case 'install_module':
          validateRequired(args, ['moduleName']);
          const moduleName = args.moduleName;
          const moduleVersion = args.version;
          const installResult = await this.nodeRedClient.installModule(
            moduleName,
            moduleVersion,
          );
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(installResult, null, 2),
              },
            ],
          };

        case 'get_installed_modules':
          const installedModules =
            await this.nodeRedClient.getInstalledModules();
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(installedModules, null, 2),
              },
            ],
          };

        default:
          throw new Error(`Unknown tool: ${name}`);
      }
    } catch (error) {
      result = {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp,
      };
    }

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  }

  /**
   * Get list of available resources
   */
  private async getResourceList() {
    const resources = [];

    try {
      // Add flow resources
      const flows = await this.nodeRedClient.getFlows();
      for (const flow of flows) {
        resources.push({
          uri: `flow://${flow.id}`,
          name: flow.label || flow.id,
          description: `Node-RED flow: ${flow.label || flow.id}`,
          mimeType: 'application/json',
        });
      }

      // Add system resource
      resources.push({
        uri: 'system://runtime',
        name: 'Node-RED System Info',
        description: 'Node-RED runtime and connection status',
        mimeType: 'application/json',
      });
    } catch (error) {
      console.error('Error getting resource list:', error);
    }

    return resources;
  }

  /**
   * Get specific resource
   */
  private async getResource(uri: string) {
    const [protocol, path] = uri.split('://');

    switch (protocol) {
      case 'flow': {
        if (!path) {
          throw new Error('Flow path is required');
        }
        const flow = await this.nodeRedClient.getFlow(path);
        const resource: NodeRedFlowResource = {
          uri,
          name: flow.label || flow.id,
          description: `Node-RED flow: ${flow.label || flow.id}`,
          mimeType: 'application/json',
          flow,
          metadata: {
            lastModified: new Date().toISOString(),
            nodeCount: flow.nodes?.length || 0,
            status: flow.disabled ? 'inactive' : 'active',
          },
        };
        return {
          contents: [
            {
              uri,
              text: JSON.stringify(resource, null, 2),
              mimeType: 'application/json',
            },
          ],
        };
      }

      case 'system': {
        const systemInfo = await this.nodeRedClient.getRuntimeInfo();
        const resource: NodeRedSystemResource = {
          uri,
          name: 'Node-RED System Info',
          description: 'Node-RED runtime and connection status',
          mimeType: 'application/json',
          system: systemInfo,
          metadata: {
            timestamp: new Date().toISOString(),
            serverVersion: this.config.version,
            connected: true,
          },
        };
        return {
          contents: [
            {
              uri,
              text: JSON.stringify(resource, null, 2),
              mimeType: 'application/json',
            },
          ],
        };
      }

      default:
        throw new Error(`Unsupported resource protocol: ${protocol}`);
    }
  }

  /**
   * Get prompt definitions
   */
  private getPromptDefinitions() {
    return [
      {
        name: 'create_simple_flow',
        description: 'Create a simple Node-RED flow with common patterns',
      },
      {
        name: 'debug_flow_issues',
        description: 'Help debug common Node-RED flow issues',
      },
      {
        name: 'optimize_flow_performance',
        description: 'Suggestions for optimizing Node-RED flow performance',
      },
      {
        name: 'flow_documentation',
        description: 'Generate documentation for a Node-RED flow',
      },
    ];
  }

  /**
   * Get specific prompt
   */
  private async getPrompt(name: string, args: any) {
    // This would contain prompt templates for common Node-RED tasks
    const prompts = {
      create_simple_flow: `Create a simple Node-RED flow that demonstrates best practices...`,
      debug_flow_issues: `Help debug this Node-RED flow by analyzing common issues...`,
      optimize_flow_performance: `Analyze this Node-RED flow for performance optimizations...`,
      flow_documentation: `Generate comprehensive documentation for this Node-RED flow...`,
    };

    return {
      description: `Node-RED ${name} prompt`,
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: prompts[name as keyof typeof prompts] || 'Prompt not found',
          },
        },
      ],
    };
  }

  /**
   * Get the underlying server instance
   */
  getServer(): Server {
    return this.server;
  }

  /**
   * Get SSE handler instance
   */
  getSSEHandler(): SSEHandler {
    return this.sseHandler;
  }

  /**
   * Get Node-RED client instance
   */
  getNodeRedClient(): NodeRedAPIClient {
    return this.nodeRedClient;
  }

  /**
   * Start the MCP server
   */
  async start(): Promise<void> {
    // Test Node-RED connection
    const connected = await this.nodeRedClient.testConnection();
    if (!connected) {
      // Use console.error for stdio transport compatibility
      const transport = process.env.MCP_TRANSPORT || 'stdio';
      if (transport === 'stdio') {
        console.error(
          'Warning: Could not connect to Node-RED. Some features may not work.',
        );
      } else {
        console.warn(
          'Warning: Could not connect to Node-RED. Some features may not work.',
        );
      }
    }

    // Log server info to stderr in stdio mode to avoid polluting stdout
    const transport = process.env.MCP_TRANSPORT || 'stdio';
    const logFunction = transport === 'stdio' ? console.error : console.log;

    logFunction(`MCP Node-RED Server started`);
    logFunction(`- Server: ${this.config.name} v${this.config.version}`);
    logFunction(`- Node-RED: ${this.config.nodeRed.url}`);
    logFunction(`- SSE: ${this.config.sse.enabled ? 'enabled' : 'disabled'}`);
  }

  /**
   * Stop the MCP server
   */
  async stop(): Promise<void> {
    this.sseHandler.destroy();

    // Log to stderr in stdio mode to avoid polluting stdout
    const transport = process.env.MCP_TRANSPORT || 'stdio';
    const logFunction = transport === 'stdio' ? console.error : console.log;
    logFunction('MCP Node-RED Server stopped');
  }

  /**
   * Public method to list tools (for HTTP API)
   */
  async listTools() {
    return { tools: this.getToolDefinitions() };
  }

  /**
   * Public method to call tools (for HTTP API)
   */
  async callToolPublic(name: string, args: any) {
    return await this.callTool(name, args);
  }

  /**
   * Public method to list resources (for HTTP API)
   */
  async listResources() {
    return { resources: await this.getResourceList() };
  }

  /**
   * Public method to read resource (for HTTP API)
   */
  async readResource(uri: string) {
    return await this.getResource(uri);
  }

  /**
   * Public method to list prompts (for HTTP API)
   */
  async listPrompts() {
    return { prompts: this.getPromptDefinitions() };
  }

  /**
   * Public method to get prompt (for HTTP API)
   */
  async getPromptPublic(name: string, args: any) {
    return await this.getPrompt(name, args);
  }
}
