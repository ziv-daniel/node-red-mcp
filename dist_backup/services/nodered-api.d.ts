/**
 * Node-RED Admin API client service
 */
import { NodeRedFlow, NodeRedFlowSummary, NodeRedNodeType, NodeRedSettings, NodeRedRuntimeInfo, NodeRedFlowStatus, NodeRedDeploymentOptions } from '../types/nodered.js';
export interface NodeRedAPIConfig {
    baseURL: string;
    timeout: number;
    retries: number;
    headers?: Record<string, string>;
}
export declare class NodeRedAPIClient {
    private client;
    private config;
    constructor(config?: Partial<NodeRedAPIConfig>);
    /**
     * Validate that response contains JSON, not HTML
     */
    private validateJsonResponse;
    /**
     * Setup axios interceptors for retries and error handling
     */
    private setupInterceptors;
    /**
     * Test connection to Node-RED
     */
    testConnection(): Promise<boolean>;
    /**
     * Get all flows
     */ getFlows(): Promise<NodeRedFlow[]>; /**
     * Get lightweight flow summaries (without node details for token efficiency)
     * Only returns specified flow types, filtering out system flows and config nodes
     * @param types - Array of flow types to include (default: ['tab', 'subflow'])
     */
    getFlowSummaries(types?: string[]): Promise<NodeRedFlowSummary[]>;
    /**
     * Get specific flow by ID
     */
    getFlow(flowId: string): Promise<NodeRedFlow>;
    /**
     * Create new flow
     */
    createFlow(flowData: Partial<NodeRedFlow>): Promise<NodeRedFlow>;
    /**
     * Update existing flow
     */
    updateFlow(flowId: string, flowData: Partial<NodeRedFlow>): Promise<NodeRedFlow>;
    /**
     * Delete flow
     */
    deleteFlow(flowId: string): Promise<void>;
    /**
     * Deploy flows
     */
    deployFlows(options?: NodeRedDeploymentOptions): Promise<void>;
    /**
     * Enable specific flow
     */
    enableFlow(flowId: string): Promise<void>;
    /**
     * Disable specific flow
     */
    disableFlow(flowId: string): Promise<void>;
    /**
     * Get all available node types
     */
    getNodeTypes(): Promise<NodeRedNodeType[]>;
    /**
     * Get specific node type
     */
    getNodeType(nodeId: string): Promise<NodeRedNodeType>;
    /**
     * Enable node type
     */
    enableNodeType(nodeId: string): Promise<void>;
    /**
     * Disable node type
     */
    disableNodeType(nodeId: string): Promise<void>;
    /**
     * Install node module
     */
    installNodeModule(moduleName: string, version?: string): Promise<void>;
    /**
     * Uninstall node module
     */
    uninstallNodeModule(moduleName: string): Promise<void>;
    /**
     * Get runtime settings
     */
    getSettings(): Promise<NodeRedSettings>;
    /**
     * Get runtime information
     */
    getRuntimeInfo(): Promise<NodeRedRuntimeInfo>;
    /**
     * Get flow status
     */
    getFlowStatus(): Promise<NodeRedFlowStatus>;
    /**
     * Start flows
     */
    startFlows(): Promise<void>;
    /**
     * Stop flows
     */
    stopFlows(): Promise<void>;
    /**
     * Get global context
     */
    getGlobalContext(key?: string): Promise<any>;
    /**
     * Set global context value
     */
    setGlobalContext(key: string, value: any): Promise<void>;
    /**
     * Delete global context key
     */
    deleteGlobalContext(key: string): Promise<void>;
    /**
     * Get flow context
     */
    getFlowContext(flowId: string, key?: string): Promise<any>;
    /**
     * Set flow context value
     */
    setFlowContext(flowId: string, key: string, value: any): Promise<void>;
    /**
     * Get library entries
     */
    getLibraryEntries(type?: string): Promise<any[]>;
    /**
     * Save to library
     */
    saveToLibrary(type: string, path: string, data: any): Promise<void>;
    /**
     * Load from library
     */
    loadFromLibrary(type: string, path: string): Promise<any>;
    /**
     * Login to Node-RED (if auth is enabled)
     */
    login(username: string, password: string): Promise<{
        access_token: string;
    }>;
    /**
     * Refresh authentication token
     */
    refreshToken(refreshToken: string): Promise<{
        access_token: string;
    }>;
    /**
     * Get current authentication status
     */
    getAuthStatus(): Promise<any>;
    /**
     * Get Node-RED version information
     */
    getVersion(): Promise<string>;
    /**
     * Check if Node-RED is healthy
     */
    healthCheck(): Promise<{
        healthy: boolean;
        details: any;
    }>;
}
//# sourceMappingURL=nodered-api.d.ts.map