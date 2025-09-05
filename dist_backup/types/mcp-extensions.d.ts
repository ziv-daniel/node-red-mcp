/**
 * Custom MCP type extensions for Node-RED integration
 */
import { NodeRedFlow, NodeRedNodeType, NodeRedRuntimeInfo } from './nodered.js';
import { SSEStats, SSEEventFilter } from './sse.js';
export interface NodeRedFlowTool {
    name: string;
    description: string;
    inputSchema: {
        type: 'object';
        properties: Record<string, any>;
        required?: string[];
    };
}
export interface McpToolResult {
    success: boolean;
    data?: any;
    error?: string;
    timestamp: string;
}
export interface FlowManagementToolParams {
    flowId?: string;
    flowData?: Partial<NodeRedFlow>;
    deploymentType?: 'full' | 'nodes' | 'flows';
}
export interface NodeManagementToolParams {
    nodeId?: string;
    nodeType?: string;
    action?: 'enable' | 'disable' | 'install' | 'remove';
    moduleData?: {
        name: string;
        version?: string;
        url?: string;
    };
}
export interface MonitoringToolParams {
    eventTypes?: string[];
    duration?: number;
    filters?: SSEEventFilter;
    includeHistory?: boolean;
}
export interface NodeRedFlowResource {
    uri: string;
    name: string;
    description?: string;
    mimeType: 'application/json';
    flow: NodeRedFlow;
    metadata: {
        lastModified: string;
        nodeCount: number;
        status: 'active' | 'inactive' | 'error';
        deployedAt?: string;
    };
}
export interface NodeRedSystemResource {
    uri: string;
    name: string;
    description?: string;
    mimeType: 'application/json';
    system: {
        runtime: NodeRedRuntimeInfo;
        nodes: NodeRedNodeType[];
        settings: Record<string, any>;
        status: {
            state: 'running' | 'stopped' | 'error';
            uptime: number;
            memory: {
                used: number;
                total: number;
            };
        };
    };
}
export interface NodeRedSSEResource {
    uri: string;
    name: string;
    description?: string;
    mimeType: 'application/json';
    sse: {
        stats: SSEStats;
        activeConnections: Array<{
            id: string;
            connectedAt: string;
            subscriptions: string[];
        }>;
        config: {
            maxConnections: number;
            heartbeatInterval: number;
        };
    };
}
export interface NodeRedPromptTemplate {
    name: string;
    description: string;
    arguments?: Array<{
        name: string;
        description: string;
        required?: boolean;
    }>;
    template: string;
}
export interface McpServerConfig {
    name: string;
    version: string;
    capabilities: {
        tools?: boolean;
        resources?: boolean;
        prompts?: boolean;
        logging?: boolean;
    };
    nodeRed: {
        url: string;
        auth?: {
            type: 'basic' | 'bearer' | 'none';
            credentials?: {
                username?: string;
                password?: string;
                token?: string;
            };
        };
        timeout: number;
        retries: number;
    };
    sse: {
        enabled: boolean;
        port?: number;
        heartbeatInterval: number;
        maxConnections: number;
    };
}
export interface McpAuthContext {
    userId?: string;
    permissions: string[];
    isAuthenticated: boolean;
    tokenExpiry?: Date;
}
export interface NodeRedToolPermissions {
    canReadFlows: boolean;
    canWriteFlows: boolean;
    canDeployFlows: boolean;
    canManageNodes: boolean;
    canAccessRuntime: boolean;
    canViewLogs: boolean;
    canManageSettings: boolean;
}
export interface McpEventHandler<T = any> {
    eventType: string;
    handler: (event: T, context: McpAuthContext) => Promise<void> | void;
    filter?: (event: T) => boolean;
}
export interface NodeRedFlowValidation {
    isValid: boolean;
    errors: Array<{
        nodeId?: string;
        type: 'error' | 'warning';
        message: string;
        code?: string;
    }>;
    warnings: Array<{
        nodeId?: string;
        message: string;
        suggestion?: string;
    }>;
}
export interface ApiResponse<T = any> {
    success: boolean;
    data?: T;
    error?: {
        code: string;
        message: string;
        details?: any;
    };
    timestamp: string;
    requestId?: string;
}
export interface PaginatedResponse<T = any> extends ApiResponse<T[]> {
    pagination: {
        page: number;
        limit: number;
        total: number;
        totalPages: number;
        hasNext: boolean;
        hasPrev: boolean;
    };
}
export interface ConfigValidationResult {
    isValid: boolean;
    errors: string[];
    warnings: string[];
    suggestions: string[];
}
export type LogLevel = 'error' | 'warn' | 'info' | 'debug' | 'trace';
export interface LogEntry {
    level: LogLevel;
    message: string;
    timestamp: string;
    source: string;
    context?: Record<string, any>;
    error?: Error;
}
//# sourceMappingURL=mcp-extensions.d.ts.map