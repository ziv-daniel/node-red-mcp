/**
 * Main MCP Server implementation for Node-RED integration
 */
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { ListResourcesRequestSchema, ListToolsRequestSchema, ListPromptsRequestSchema, CallToolRequestSchema, ReadResourceRequestSchema, GetPromptRequestSchema, } from '@modelcontextprotocol/sdk/types.js';
import { NodeRedAPIClient } from '../services/nodered-api.js';
import { SSEHandler } from './sse-handler.js';
import { validateRequired } from '../utils/error-handling.js';
export class McpNodeRedServer {
    server;
    nodeRedClient;
    sseHandler;
    config;
    constructor(config = {}) {
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
                heartbeatInterval: parseInt(process.env.SSE_HEARTBEAT_INTERVAL || '30000'),
                maxConnections: parseInt(process.env.SSE_MAX_CONNECTIONS || '100'),
            },
            ...config,
        };
        this.server = new Server({
            name: this.config.name,
            version: this.config.version,
        }, {
            capabilities: {
                tools: this.config.capabilities.tools ? {} : undefined,
                resources: this.config.capabilities.resources ? {} : undefined,
                prompts: this.config.capabilities.prompts ? {} : undefined,
                logging: this.config.capabilities.logging ? {} : undefined,
            },
        });
        this.nodeRedClient = new NodeRedAPIClient(this.config.nodeRed);
        this.sseHandler = new SSEHandler(this.config.sse);
        this.setupHandlers();
    }
    /**
     * Setup MCP request handlers
     */
    setupHandlers() {
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
        this.server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
            const { uri } = request.params;
            return await this.getResource(uri);
        });
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
    getToolDefinitions() {
        return [
            // Flow Management Tools
            {
                name: 'get_flows',
                description: 'Get Node-RED flows with flexible filtering (summary info by default, use includeDetails for full data)',
                inputSchema: {
                    type: 'object',
                    properties: {
                        includeDetails: {
                            type: 'boolean',
                            description: 'Include full flow details with nodes (default: false for token efficiency)',
                            default: false
                        },
                        types: {
                            type: 'array',
                            items: { type: 'string' },
                            description: 'Flow types to include (default: ["tab", "subflow"]). Options: "tab" (main flows), "subflow" (reusable subflows)',
                            default: ['tab', 'subflow']
                        }
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
                name: 'delete_flow',
                description: 'Delete a Node-RED flow',
                inputSchema: {
                    type: 'object',
                    properties: {
                        flowId: { type: 'string', description: 'Flow ID to delete' },
                    },
                    required: ['flowId'],
                },
            },
            {
                name: 'deploy_flows',
                description: 'Deploy Node-RED flows',
                inputSchema: {
                    type: 'object',
                    properties: {
                        deploymentType: {
                            type: 'string',
                            enum: ['full', 'nodes', 'flows'],
                            description: 'Type of deployment',
                        },
                    },
                    required: [],
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
            // Node Management Tools
            {
                name: 'get_node_types',
                description: 'Get all available Node-RED node types',
                inputSchema: {
                    type: 'object',
                    properties: {},
                    required: [],
                },
            },
            {
                name: 'get_node_type',
                description: 'Get specific Node-RED node type information',
                inputSchema: {
                    type: 'object',
                    properties: {
                        nodeId: { type: 'string', description: 'Node type ID' },
                    },
                    required: ['nodeId'],
                },
            },
            {
                name: 'enable_node_type',
                description: 'Enable a specific node type',
                inputSchema: {
                    type: 'object',
                    properties: {
                        nodeId: { type: 'string', description: 'Node type ID to enable' },
                    },
                    required: ['nodeId'],
                },
            },
            {
                name: 'disable_node_type',
                description: 'Disable a specific node type',
                inputSchema: {
                    type: 'object',
                    properties: {
                        nodeId: { type: 'string', description: 'Node type ID to disable' },
                    },
                    required: ['nodeId'],
                },
            },
            {
                name: 'install_node_module',
                description: 'Install a Node-RED node module',
                inputSchema: {
                    type: 'object',
                    properties: {
                        moduleName: {
                            type: 'string',
                            description: 'Module name to install',
                        },
                        version: {
                            type: 'string',
                            description: 'Specific version (optional)',
                        },
                    },
                    required: ['moduleName'],
                },
            },
            {
                name: 'uninstall_node_module',
                description: 'Uninstall a Node-RED node module',
                inputSchema: {
                    type: 'object',
                    properties: {
                        moduleName: {
                            type: 'string',
                            description: 'Module name to uninstall',
                        },
                    },
                    required: ['moduleName'],
                },
            },
            // Runtime and Monitoring Tools
            {
                name: 'get_runtime_info',
                description: 'Get Node-RED runtime information',
                inputSchema: {
                    type: 'object',
                    properties: {},
                    required: [],
                },
            },
            {
                name: 'get_settings',
                description: 'Get Node-RED settings',
                inputSchema: {
                    type: 'object',
                    properties: {},
                    required: [],
                },
            },
            {
                name: 'get_flow_status',
                description: 'Get current flow status',
                inputSchema: {
                    type: 'object',
                    properties: {},
                    required: [],
                },
            },
            {
                name: 'start_flows',
                description: 'Start all Node-RED flows',
                inputSchema: {
                    type: 'object',
                    properties: {},
                    required: [],
                },
            },
            {
                name: 'stop_flows',
                description: 'Stop all Node-RED flows',
                inputSchema: {
                    type: 'object',
                    properties: {},
                    required: [],
                },
            },
            {
                name: 'health_check',
                description: 'Perform Node-RED health check',
                inputSchema: {
                    type: 'object',
                    properties: {},
                    required: [],
                },
            },
            // SSE Management Tools
            {
                name: 'get_sse_stats',
                description: 'Get Server-Sent Events statistics',
                inputSchema: {
                    type: 'object',
                    properties: {},
                    required: [],
                },
            },
            {
                name: 'get_sse_clients',
                description: 'Get connected SSE clients',
                inputSchema: {
                    type: 'object',
                    properties: {},
                    required: [],
                },
            },
            {
                name: 'disconnect_sse_client',
                description: 'Force disconnect a specific SSE client',
                inputSchema: {
                    type: 'object',
                    properties: {
                        connectionId: {
                            type: 'string',
                            description: 'Connection ID to disconnect',
                        },
                    },
                    required: ['connectionId'],
                },
            },
            // Context Management Tools
            {
                name: 'get_global_context',
                description: 'Get Node-RED global context',
                inputSchema: {
                    type: 'object',
                    properties: {
                        key: {
                            type: 'string',
                            description: 'Specific context key (optional)',
                        },
                    },
                    required: [],
                },
            },
            {
                name: 'set_global_context',
                description: 'Set Node-RED global context value',
                inputSchema: {
                    type: 'object',
                    properties: {
                        key: { type: 'string', description: 'Context key' },
                        value: { description: 'Context value' },
                    },
                    required: ['key', 'value'],
                },
            },
            {
                name: 'delete_global_context',
                description: 'Delete Node-RED global context key',
                inputSchema: {
                    type: 'object',
                    properties: {
                        key: { type: 'string', description: 'Context key to delete' },
                    },
                    required: ['key'],
                },
            },
        ];
    }
    /**
     * Call a specific tool
     */
    async callTool(name, args) {
        const timestamp = new Date().toISOString();
        let result;
        try {
            switch (name) {
                // Flow Management Tools
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
                    result = {
                        success: true,
                        data: await this.nodeRedClient.createFlow(args.flowData),
                        timestamp,
                    };
                    break;
                case 'update_flow':
                    validateRequired(args, ['flowId', 'flowData']);
                    result = {
                        success: true,
                        data: await this.nodeRedClient.updateFlow(args.flowId, args.flowData),
                        timestamp,
                    };
                    break;
                case 'delete_flow':
                    validateRequired(args, ['flowId']);
                    await this.nodeRedClient.deleteFlow(args.flowId);
                    result = {
                        success: true,
                        data: { message: 'Flow deleted successfully' },
                        timestamp,
                    };
                    break;
                case 'deploy_flows':
                    await this.nodeRedClient.deployFlows(args);
                    result = {
                        success: true,
                        data: { message: 'Flows deployed successfully' },
                        timestamp,
                    };
                    break;
                case 'enable_flow':
                    validateRequired(args, ['flowId']);
                    await this.nodeRedClient.enableFlow(args.flowId);
                    result = {
                        success: true,
                        data: { message: 'Flow enabled successfully' },
                        timestamp,
                    };
                    break;
                case 'disable_flow':
                    validateRequired(args, ['flowId']);
                    await this.nodeRedClient.disableFlow(args.flowId);
                    result = {
                        success: true,
                        data: { message: 'Flow disabled successfully' },
                        timestamp,
                    };
                    break;
                // Node Management Tools
                case 'get_node_types':
                    result = {
                        success: true,
                        data: await this.nodeRedClient.getNodeTypes(),
                        timestamp,
                    };
                    break;
                case 'get_node_type':
                    validateRequired(args, ['nodeId']);
                    result = {
                        success: true,
                        data: await this.nodeRedClient.getNodeType(args.nodeId),
                        timestamp,
                    };
                    break;
                case 'enable_node_type':
                    validateRequired(args, ['nodeId']);
                    await this.nodeRedClient.enableNodeType(args.nodeId);
                    result = {
                        success: true,
                        data: { message: 'Node type enabled successfully' },
                        timestamp,
                    };
                    break;
                case 'disable_node_type':
                    validateRequired(args, ['nodeId']);
                    await this.nodeRedClient.disableNodeType(args.nodeId);
                    result = {
                        success: true,
                        data: { message: 'Node type disabled successfully' },
                        timestamp,
                    };
                    break;
                case 'install_node_module':
                    validateRequired(args, ['moduleName']);
                    await this.nodeRedClient.installNodeModule(args.moduleName, args.version);
                    result = {
                        success: true,
                        data: { message: 'Node module installed successfully' },
                        timestamp,
                    };
                    break;
                case 'uninstall_node_module':
                    validateRequired(args, ['moduleName']);
                    await this.nodeRedClient.uninstallNodeModule(args.moduleName);
                    result = {
                        success: true,
                        data: { message: 'Node module uninstalled successfully' },
                        timestamp,
                    };
                    break;
                // Runtime and Monitoring Tools
                case 'get_runtime_info':
                    result = {
                        success: true,
                        data: await this.nodeRedClient.getRuntimeInfo(),
                        timestamp,
                    };
                    break;
                case 'get_settings':
                    result = {
                        success: true,
                        data: await this.nodeRedClient.getSettings(),
                        timestamp,
                    };
                    break;
                case 'get_flow_status':
                    result = {
                        success: true,
                        data: await this.nodeRedClient.getFlowStatus(),
                        timestamp,
                    };
                    break;
                case 'start_flows':
                    await this.nodeRedClient.startFlows();
                    result = {
                        success: true,
                        data: { message: 'Flows started successfully' },
                        timestamp,
                    };
                    break;
                case 'stop_flows':
                    await this.nodeRedClient.stopFlows();
                    result = {
                        success: true,
                        data: { message: 'Flows stopped successfully' },
                        timestamp,
                    };
                    break;
                case 'health_check':
                    result = {
                        success: true,
                        data: await this.nodeRedClient.healthCheck(),
                        timestamp,
                    };
                    break;
                // SSE Management Tools
                case 'get_sse_stats':
                    result = {
                        success: true,
                        data: this.sseHandler.getStats(),
                        timestamp,
                    };
                    break;
                case 'get_sse_clients':
                    result = {
                        success: true,
                        data: this.sseHandler.getClients(),
                        timestamp,
                    };
                    break;
                case 'disconnect_sse_client':
                    validateRequired(args, ['connectionId']);
                    const disconnected = this.sseHandler.forceDisconnect(args.connectionId);
                    result = {
                        success: disconnected,
                        data: {
                            message: disconnected
                                ? 'Client disconnected successfully'
                                : 'Client not found or already disconnected',
                        },
                        timestamp,
                    };
                    break;
                // Context Management Tools
                case 'get_global_context':
                    result = {
                        success: true,
                        data: await this.nodeRedClient.getGlobalContext(args.key),
                        timestamp,
                    };
                    break;
                case 'set_global_context':
                    validateRequired(args, ['key', 'value']);
                    await this.nodeRedClient.setGlobalContext(args.key, args.value);
                    result = {
                        success: true,
                        data: { message: 'Global context set successfully' },
                        timestamp,
                    };
                    break;
                case 'delete_global_context':
                    validateRequired(args, ['key']);
                    await this.nodeRedClient.deleteGlobalContext(args.key);
                    result = {
                        success: true,
                        data: { message: 'Global context key deleted successfully' },
                        timestamp,
                    };
                    break;
                default:
                    throw new Error(`Unknown tool: ${name}`);
            }
        }
        catch (error) {
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
    async getResourceList() {
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
                description: 'Node-RED runtime and system information',
                mimeType: 'application/json',
            });
            // Add SSE resource
            resources.push({
                uri: 'sse://stats',
                name: 'SSE Statistics',
                description: 'Server-Sent Events statistics and connection info',
                mimeType: 'application/json',
            });
        }
        catch (error) {
            console.error('Error getting resource list:', error);
        }
        return resources;
    }
    /**
     * Get specific resource
     */
    async getResource(uri) {
        const [protocol, path] = uri.split('://');
        switch (protocol) {
            case 'flow': {
                if (!path) {
                    throw new Error('Flow path is required');
                }
                const flow = await this.nodeRedClient.getFlow(path);
                const resource = {
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
                            mimeType: 'application/json',
                            text: JSON.stringify(resource, null, 2),
                        },
                    ],
                };
            }
            case 'system': {
                const [runtime, nodes, settings] = await Promise.all([
                    this.nodeRedClient.getRuntimeInfo(),
                    this.nodeRedClient.getNodeTypes(),
                    this.nodeRedClient.getSettings(),
                ]);
                const resource = {
                    uri,
                    name: 'Node-RED System Info',
                    description: 'Node-RED runtime and system information',
                    mimeType: 'application/json',
                    system: {
                        runtime,
                        nodes,
                        settings,
                        status: {
                            state: 'running',
                            uptime: process.uptime(),
                            memory: {
                                used: process.memoryUsage().heapUsed,
                                total: process.memoryUsage().heapTotal,
                            },
                        },
                    },
                };
                return {
                    contents: [
                        {
                            uri,
                            mimeType: 'application/json',
                            text: JSON.stringify(resource, null, 2),
                        },
                    ],
                };
            }
            case 'sse': {
                const resource = {
                    uri,
                    name: 'SSE Statistics',
                    description: 'Server-Sent Events statistics and connection info',
                    mimeType: 'application/json',
                    sse: {
                        stats: this.sseHandler.getStats(),
                        activeConnections: this.sseHandler.getClients().map((client) => ({
                            id: client.connectionId,
                            connectedAt: client.connectedAt.toISOString(),
                            subscriptions: client.subscriptions,
                        })),
                        config: {
                            maxConnections: this.config.sse.maxConnections,
                            heartbeatInterval: this.config.sse.heartbeatInterval,
                        },
                    },
                };
                return {
                    contents: [
                        {
                            uri,
                            mimeType: 'application/json',
                            text: JSON.stringify(resource, null, 2),
                        },
                    ],
                };
            }
            default:
                throw new Error(`Unknown resource protocol: ${protocol}`);
        }
    }
    /**
     * Get prompt definitions
     */
    getPromptDefinitions() {
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
    async getPrompt(name, args) {
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
                        text: prompts[name] || 'Prompt not found',
                    },
                },
            ],
        };
    }
    /**
     * Get the underlying server instance
     */
    getServer() {
        return this.server;
    }
    /**
     * Get SSE handler instance
     */
    getSSEHandler() {
        return this.sseHandler;
    }
    /**
     * Get Node-RED client instance
     */
    getNodeRedClient() {
        return this.nodeRedClient;
    }
    /**
     * Start the MCP server
     */
    async start() {
        // Test Node-RED connection
        const connected = await this.nodeRedClient.testConnection();
        if (!connected) {
            // Use console.error for stdio transport compatibility
            const transport = process.env.MCP_TRANSPORT || 'stdio';
            if (transport === 'stdio') {
                console.error('Warning: Could not connect to Node-RED. Some features may not work.');
            }
            else {
                console.warn('Warning: Could not connect to Node-RED. Some features may not work.');
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
    async stop() {
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
    async callToolPublic(name, args) {
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
    async readResource(uri) {
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
    async getPromptPublic(name, args) {
        return await this.getPrompt(name, args);
    }
}
//# sourceMappingURL=mcp-server.js.map