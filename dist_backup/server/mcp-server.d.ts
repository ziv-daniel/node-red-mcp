/**
 * Main MCP Server implementation for Node-RED integration
 */
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { NodeRedAPIClient } from '../services/nodered-api.js';
import { SSEHandler } from './sse-handler.js';
import { McpServerConfig } from '../types/mcp-extensions.js';
export declare class McpNodeRedServer {
    private server;
    private nodeRedClient;
    private sseHandler;
    private config;
    constructor(config?: Partial<McpServerConfig>);
    /**
     * Setup MCP request handlers
     */
    private setupHandlers;
    /**
     * Get tool definitions
     */
    private getToolDefinitions;
    /**
     * Call a specific tool
     */
    private callTool;
    /**
     * Get list of available resources
     */
    private getResourceList;
    /**
     * Get specific resource
     */
    private getResource;
    /**
     * Get prompt definitions
     */
    private getPromptDefinitions;
    /**
     * Get specific prompt
     */
    private getPrompt;
    /**
     * Get the underlying server instance
     */
    getServer(): Server;
    /**
     * Get SSE handler instance
     */
    getSSEHandler(): SSEHandler;
    /**
     * Get Node-RED client instance
     */
    getNodeRedClient(): NodeRedAPIClient;
    /**
     * Start the MCP server
     */
    start(): Promise<void>;
    /**
     * Stop the MCP server
     */
    stop(): Promise<void>;
    /**
     * Public method to list tools (for HTTP API)
     */
    listTools(): Promise<{
        tools: ({
            name: string;
            description: string;
            inputSchema: {
                type: string;
                properties: {
                    includeDetails: {
                        type: string;
                        description: string;
                        default: boolean;
                    };
                    types: {
                        type: string;
                        items: {
                            type: string;
                        };
                        description: string;
                        default: string[];
                    };
                    flowId?: undefined;
                    flowData?: undefined;
                    deploymentType?: undefined;
                    nodeId?: undefined;
                    moduleName?: undefined;
                    version?: undefined;
                    connectionId?: undefined;
                    key?: undefined;
                    value?: undefined;
                };
                required: never[];
            };
        } | {
            name: string;
            description: string;
            inputSchema: {
                type: string;
                properties: {
                    flowId: {
                        type: string;
                        description: string;
                    };
                    includeDetails?: undefined;
                    types?: undefined;
                    flowData?: undefined;
                    deploymentType?: undefined;
                    nodeId?: undefined;
                    moduleName?: undefined;
                    version?: undefined;
                    connectionId?: undefined;
                    key?: undefined;
                    value?: undefined;
                };
                required: string[];
            };
        } | {
            name: string;
            description: string;
            inputSchema: {
                type: string;
                properties: {
                    flowData: {
                        type: string;
                        description: string;
                        properties: {
                            label: {
                                type: string;
                            };
                            nodes: {
                                type: string;
                            };
                            disabled: {
                                type: string;
                            };
                        };
                    };
                    includeDetails?: undefined;
                    types?: undefined;
                    flowId?: undefined;
                    deploymentType?: undefined;
                    nodeId?: undefined;
                    moduleName?: undefined;
                    version?: undefined;
                    connectionId?: undefined;
                    key?: undefined;
                    value?: undefined;
                };
                required: string[];
            };
        } | {
            name: string;
            description: string;
            inputSchema: {
                type: string;
                properties: {
                    flowId: {
                        type: string;
                        description: string;
                    };
                    flowData: {
                        type: string;
                        description: string;
                        properties?: undefined;
                    };
                    includeDetails?: undefined;
                    types?: undefined;
                    deploymentType?: undefined;
                    nodeId?: undefined;
                    moduleName?: undefined;
                    version?: undefined;
                    connectionId?: undefined;
                    key?: undefined;
                    value?: undefined;
                };
                required: string[];
            };
        } | {
            name: string;
            description: string;
            inputSchema: {
                type: string;
                properties: {
                    deploymentType: {
                        type: string;
                        enum: string[];
                        description: string;
                    };
                    includeDetails?: undefined;
                    types?: undefined;
                    flowId?: undefined;
                    flowData?: undefined;
                    nodeId?: undefined;
                    moduleName?: undefined;
                    version?: undefined;
                    connectionId?: undefined;
                    key?: undefined;
                    value?: undefined;
                };
                required: never[];
            };
        } | {
            name: string;
            description: string;
            inputSchema: {
                type: string;
                properties: {
                    includeDetails?: undefined;
                    types?: undefined;
                    flowId?: undefined;
                    flowData?: undefined;
                    deploymentType?: undefined;
                    nodeId?: undefined;
                    moduleName?: undefined;
                    version?: undefined;
                    connectionId?: undefined;
                    key?: undefined;
                    value?: undefined;
                };
                required: never[];
            };
        } | {
            name: string;
            description: string;
            inputSchema: {
                type: string;
                properties: {
                    nodeId: {
                        type: string;
                        description: string;
                    };
                    includeDetails?: undefined;
                    types?: undefined;
                    flowId?: undefined;
                    flowData?: undefined;
                    deploymentType?: undefined;
                    moduleName?: undefined;
                    version?: undefined;
                    connectionId?: undefined;
                    key?: undefined;
                    value?: undefined;
                };
                required: string[];
            };
        } | {
            name: string;
            description: string;
            inputSchema: {
                type: string;
                properties: {
                    moduleName: {
                        type: string;
                        description: string;
                    };
                    version: {
                        type: string;
                        description: string;
                    };
                    includeDetails?: undefined;
                    types?: undefined;
                    flowId?: undefined;
                    flowData?: undefined;
                    deploymentType?: undefined;
                    nodeId?: undefined;
                    connectionId?: undefined;
                    key?: undefined;
                    value?: undefined;
                };
                required: string[];
            };
        } | {
            name: string;
            description: string;
            inputSchema: {
                type: string;
                properties: {
                    moduleName: {
                        type: string;
                        description: string;
                    };
                    includeDetails?: undefined;
                    types?: undefined;
                    flowId?: undefined;
                    flowData?: undefined;
                    deploymentType?: undefined;
                    nodeId?: undefined;
                    version?: undefined;
                    connectionId?: undefined;
                    key?: undefined;
                    value?: undefined;
                };
                required: string[];
            };
        } | {
            name: string;
            description: string;
            inputSchema: {
                type: string;
                properties: {
                    connectionId: {
                        type: string;
                        description: string;
                    };
                    includeDetails?: undefined;
                    types?: undefined;
                    flowId?: undefined;
                    flowData?: undefined;
                    deploymentType?: undefined;
                    nodeId?: undefined;
                    moduleName?: undefined;
                    version?: undefined;
                    key?: undefined;
                    value?: undefined;
                };
                required: string[];
            };
        } | {
            name: string;
            description: string;
            inputSchema: {
                type: string;
                properties: {
                    key: {
                        type: string;
                        description: string;
                    };
                    value: {
                        description: string;
                    };
                    includeDetails?: undefined;
                    types?: undefined;
                    flowId?: undefined;
                    flowData?: undefined;
                    deploymentType?: undefined;
                    nodeId?: undefined;
                    moduleName?: undefined;
                    version?: undefined;
                    connectionId?: undefined;
                };
                required: string[];
            };
        } | {
            name: string;
            description: string;
            inputSchema: {
                type: string;
                properties: {
                    key: {
                        type: string;
                        description: string;
                    };
                    includeDetails?: undefined;
                    types?: undefined;
                    flowId?: undefined;
                    flowData?: undefined;
                    deploymentType?: undefined;
                    nodeId?: undefined;
                    moduleName?: undefined;
                    version?: undefined;
                    connectionId?: undefined;
                    value?: undefined;
                };
                required: string[];
            };
        })[];
    }>;
    /**
     * Public method to call tools (for HTTP API)
     */
    callToolPublic(name: string, args: any): Promise<{
        content: any[];
    }>;
    /**
     * Public method to list resources (for HTTP API)
     */
    listResources(): Promise<{
        resources: {
            uri: string;
            name: string;
            description: string;
            mimeType: string;
        }[];
    }>;
    /**
     * Public method to read resource (for HTTP API)
     */
    readResource(uri: string): Promise<{
        contents: {
            uri: string;
            mimeType: string;
            text: string;
        }[];
    }>;
    /**
     * Public method to list prompts (for HTTP API)
     */
    listPrompts(): Promise<{
        prompts: {
            name: string;
            description: string;
        }[];
    }>;
    /**
     * Public method to get prompt (for HTTP API)
     */
    getPromptPublic(name: string, args: any): Promise<{
        description: string;
        messages: {
            role: string;
            content: {
                type: string;
                text: string;
            };
        }[];
    }>;
}
//# sourceMappingURL=mcp-server.d.ts.map