/**
 * Node-RED Admin API client service
 */

import axios, { AxiosInstance, AxiosResponse, AxiosError } from 'axios';
import { v4 as uuidv4 } from 'uuid';

import {
  NodeRedFlow,
  NodeRedFlowSummary,
  NodeRedNode,
  NodeRedNodeType,
  NodeRedSettings,
  NodeRedRuntimeInfo,
  NodeRedFlowStatus,
  NodeRedDeploymentOptions,
  NodeRedAPIError,
} from '../types/nodered.js';
import { getNodeRedAuthHeader } from '../utils/auth.js';
import { handleNodeRedError } from '../utils/error-handling.js';
import { CircuitBreaker, retryWithCircuitBreaker, type RetryOptions } from '../utils/retry.js';

export interface NodeRedAPIConfig {
  baseURL: string;
  timeout: number;
  retries: number;
  headers?: Record<string, string>;
}

// Add new interfaces for module management
export interface NodeRedModule {
  name: string;
  version: string;
  description?: string;
  author?: string;
  keywords?: string[];
  repository?: string;
  downloads?: number;
  updated?: string;
}

export interface ModuleSearchResult {
  modules: NodeRedModule[];
  total: number;
  query: string;
}

export interface ModuleInstallResult {
  success: boolean;
  module: string;
  version?: string | undefined;
  message: string;
}

export class NodeRedAPIClient {
  private client: AxiosInstance;
  private config: NodeRedAPIConfig;
  private circuitBreaker: CircuitBreaker;
  private retryOptions: RetryOptions;

  constructor(config: Partial<NodeRedAPIConfig> = {}) {
    this.config = {
      baseURL: process.env.NODERED_URL || 'http://localhost:1880',
      timeout: parseInt(process.env.NODERED_TIMEOUT || '5000'),
      retries: parseInt(process.env.NODERED_RETRIES || '3'),
      ...config,
    };

    // Initialize circuit breaker
    this.circuitBreaker = new CircuitBreaker({
      failureThreshold: 5,
      successThreshold: 2,
      timeout: 60000, // 1 minute
      onStateChange: state => {
        console.error(`Node-RED API Circuit Breaker state changed to: ${state}`);
      },
    });

    // Configure retry options
    this.retryOptions = {
      maxRetries: this.config.retries,
      initialDelay: 1000,
      maxDelay: 10000,
      backoffMultiplier: 2,
      timeout: this.config.timeout,
      shouldRetry: (error: Error) => {
        // Don't retry on 4xx errors (except 429 rate limit)
        if (axios.isAxiosError(error) && error.response) {
          const status = error.response.status;
          if (status >= 400 && status < 500 && status !== 429) {
            return false;
          }
        }
        return true;
      },
      onRetry: (error, attempt, delay) => {
        console.warn(
          `Node-RED API request failed (attempt ${attempt}), retrying in ${delay}ms:`,
          error.message
        );
      },
    };

    this.client = axios.create({
      baseURL: this.config.baseURL,
      timeout: this.config.timeout,
      headers: {
        'Content-Type': 'application/json',
        ...getNodeRedAuthHeader(),
        ...this.config.headers,
      },
    });

    this.setupInterceptors();
  }
  /**
   * Validate that response contains JSON, not HTML
   */
  private validateJsonResponse(response: any, endpoint: string): void {
    const contentType = response.headers['content-type'] || '';
    const data = response.data;

    // Check if content-type indicates HTML
    if (contentType.includes('text/html')) {
      throw new Error(
        `Node-RED returned HTML instead of JSON for ${endpoint}. This usually indicates an authentication redirect or wrong endpoint. Content-Type: ${contentType}`
      );
    }

    // Check if data looks like HTML (starts with common HTML indicators)
    if (
      typeof data === 'string' &&
      (data.trim().startsWith('<!DOCTYPE') ||
        data.trim().startsWith('<html') ||
        data.trim().startsWith('Node-RED') ||
        data.includes('<title>'))
    ) {
      const preview = data.length > 100 ? `${data.substring(0, 100)}...` : data;
      throw new Error(
        `Node-RED returned HTML content instead of JSON for ${endpoint}. This usually indicates an authentication issue or wrong endpoint. Response preview: ${preview}`
      );
    }
  }

  /**
   * Setup axios interceptors for retries and error handling
   */
  private setupInterceptors(): void {
    // Request interceptor for logging
    this.client.interceptors.request.use(
      config =>
        // Silent request logging to avoid stdio interference
        config,
      error => Promise.reject(error)
    ); // Response interceptor for validation and retry logic
    this.client.interceptors.response.use(
      response => {
        // Skip validation for root endpoint (which returns HTML by design)
        if (!response.config.url?.endsWith('/')) {
          try {
            this.validateJsonResponse(response, response.config.url || 'unknown');
          } catch (validationError: any) {
            // Silent validation warning to avoid stdio interference
            // For HTML responses on API endpoints, we'll retry once more
            const config = response.config as any;
            if (config._htmlRetryCount < 1) {
              config._htmlRetryCount = (config._htmlRetryCount || 0) + 1;
              // Small delay before retry
              setTimeout(() => {}, 500);
              return this.client(response.config);
            } else {
              // If we still get HTML after retry, throw the validation error
              throw validationError;
            }
          }
        }
        return response;
      },
      async error => {
        const config = error.config;

        if (!config._retry && config._retryCount < this.config.retries) {
          config._retry = true;
          config._retryCount = (config._retryCount || 0) + 1;

          // Exponential backoff
          const delay = Math.pow(2, config._retryCount) * 1000;
          await new Promise(resolve => setTimeout(resolve, delay));

          return this.client(config);
        }

        return Promise.reject(error);
      }
    );
  }

  /**
   * Wrapper for API calls with circuit breaker and retry logic
   */
  private async withRetry<T>(operation: () => Promise<T>): Promise<T> {
    return retryWithCircuitBreaker(operation, this.circuitBreaker, this.retryOptions);
  }

  /**
   * Get circuit breaker stats
   */
  getCircuitBreakerStats() {
    return this.circuitBreaker.getStats();
  }

  /**
   * Reset circuit breaker
   */
  resetCircuitBreaker(): void {
    this.circuitBreaker.reset();
  }

  /**
   * Generate unique flow ID
   */
  private generateUniqueFlowId(): string {
    return uuidv4().replace(/-/g, '').substring(0, 16);
  }

  /**
   * Generate unique node ID
   */
  private generateUniqueNodeId(): string {
    return uuidv4().replace(/-/g, '').substring(0, 12);
  }

  /**
   * Ensure all nodes in a flow have unique IDs
   */
  private ensureUniqueNodeIds(flowData: Partial<NodeRedFlow>): Partial<NodeRedFlow> {
    const updatedFlow = { ...flowData };

    if (updatedFlow.nodes && Array.isArray(updatedFlow.nodes)) {
      updatedFlow.nodes = updatedFlow.nodes.map(node => ({
        ...node,
        id: node.id || this.generateUniqueNodeId(),
      }));
    }

    return updatedFlow;
  }

  /**
   * Test connection to Node-RED
   */
  async testConnection(): Promise<boolean> {
    try {
      await this.client.get('/');
      return true;
    } catch (error) {
      console.error('Node-RED connection test failed:', error);
      return false;
    }
  }

  // === Flow Management ===
  /**
   * Get all flows
   */ async getFlows(): Promise<NodeRedFlow[]> {
    try {
      const response = await this.client.get('/flows');

      // Additional validation for the flows response
      if (!Array.isArray(response.data)) {
        if (typeof response.data === 'string' && response.data.includes('Node-RED')) {
          throw new Error(
            'Node-RED returned HTML content instead of flow data. Check authentication and endpoint configuration.'
          );
        }
      }

      return response.data;
    } catch (error) {
      handleNodeRedError(error, 'getFlows');
    }
  } /**
   * Get lightweight flow summaries (without node details for token efficiency)
   * Only returns specified flow types, filtering out system flows and config nodes
   * @param types - Array of flow types to include (default: ['tab', 'subflow'])
   */
  async getFlowSummaries(types: string[] = ['tab', 'subflow']): Promise<NodeRedFlowSummary[]> {
    try {
      const [fullFlows, flowStatus] = await Promise.all([
        this.getFlows(),
        this.getFlowStatus().catch(() => null), // Graceful fallback if flow status not available
      ]); // Filter flows based on requested types
      const userFlows = fullFlows.filter(flow => {
        // Determine the flow type (tab, subflow, or config node type)
        const hasNodes = Array.isArray(flow.nodes);
        const flowType = flow.type || (hasNodes ? 'tab' : 'unknown');

        // Check if this flow type is in the requested types
        const isRequestedType = types.includes(flowType);

        // Exclude config nodes unless specifically requested
        const isConfigNode = !hasNodes && flow.type && !['tab', 'subflow'].includes(flow.type);
        const shouldExcludeConfig = isConfigNode && flow.type && !types.includes(flow.type);

        // Include flows that match requested types and have nodes (or are specifically config types if requested)
        return isRequestedType && !shouldExcludeConfig && (hasNodes || types.includes(flowType));
      });

      return userFlows.map(flow => {
        const status = flowStatus?.flows?.find(f => f.id === flow.id);

        // Build summary object with only meaningful properties
        const summary: NodeRedFlowSummary = {
          id: flow.id,
          disabled: flow.disabled || false,
          status: flow.disabled ? 'inactive' : status?.state === 'stop' ? 'inactive' : 'active',
        };

        // Only add label if it exists and is not empty
        if (flow.label?.trim()) {
          summary.label = flow.label;
        }

        // Only add info if it exists and is not empty
        if (flow.info?.trim()) {
          summary.info = flow.info;
        }

        // Only add nodeCount if it's meaningful (> 0)
        const nodeCount = flow.nodes?.length || 0;
        if (nodeCount > 0) {
          summary.nodeCount = nodeCount;
        }

        return summary;
      });
    } catch (error) {
      handleNodeRedError(error, 'getFlowSummaries');
    }
  }

  /**
   * Get specific flow by ID
   */
  async getFlow(flowId: string): Promise<NodeRedFlow> {
    try {
      const response = await this.client.get(`/flow/${flowId}`);
      return response.data;
    } catch (error) {
      handleNodeRedError(error, `getFlow(${flowId})`);
    }
  }

  /**
   * Create new flow with automatic unique ID generation
   */
  async createFlow(flowData: Partial<NodeRedFlow>): Promise<NodeRedFlow> {
    try {
      // Ensure the flow has a unique ID
      const flowToCreate = {
        ...flowData,
        id: flowData.id || this.generateUniqueFlowId(),
        type: flowData.type || 'tab',
      };

      // Ensure all nodes have unique IDs
      const flowWithUniqueIds = this.ensureUniqueNodeIds(flowToCreate);

      const response = await this.client.post('/flow', flowWithUniqueIds);
      return response.data;
    } catch (error) {
      handleNodeRedError(error, 'createFlow');
    }
  }

  /**
   * Update existing flow
   */
  async updateFlow(flowId: string, flowData: Partial<NodeRedFlow>): Promise<NodeRedFlow> {
    try {
      const response = await this.client.put(`/flow/${flowId}`, flowData);
      return response.data;
    } catch (error) {
      handleNodeRedError(error, `updateFlow(${flowId})`);
    }
  }

  /**
   * Delete flow
   */
  async deleteFlow(flowId: string): Promise<void> {
    try {
      await this.client.delete(`/flow/${flowId}`);
    } catch (error) {
      handleNodeRedError(error, `deleteFlow(${flowId})`);
    }
  }

  /**
   * Deploy flows
   */
  async deployFlows(options: NodeRedDeploymentOptions = { type: 'full' }): Promise<void> {
    try {
      await this.client.post('/flows', null, {
        headers: {
          'Node-RED-Deployment-Type': options.type,
        },
      });
    } catch (error) {
      handleNodeRedError(error, 'deployFlows');
    }
  }

  /**
   * Enable specific flow
   */
  async enableFlow(flowId: string): Promise<void> {
    try {
      const flow = await this.getFlow(flowId);
      flow.disabled = false;
      await this.updateFlow(flowId, flow);
      await this.deployFlows({ type: 'flows' });
    } catch (error) {
      handleNodeRedError(error, `enableFlow(${flowId})`);
    }
  }

  /**
   * Disable specific flow
   */
  async disableFlow(flowId: string): Promise<void> {
    try {
      const flow = await this.getFlow(flowId);
      flow.disabled = true;
      await this.updateFlow(flowId, flow);
      await this.deployFlows({ type: 'flows' });
    } catch (error) {
      handleNodeRedError(error, `disableFlow(${flowId})`);
    }
  }

  // === Node Management ===

  /**
   * Get all available node types
   */
  async getNodeTypes(): Promise<NodeRedNodeType[]> {
    try {
      const response = await this.client.get('/nodes');
      return response.data;
    } catch (error) {
      handleNodeRedError(error, 'getNodeTypes');
    }
  }

  /**
   * Get specific node type
   */
  async getNodeType(nodeId: string): Promise<NodeRedNodeType> {
    try {
      const response = await this.client.get(`/nodes/${nodeId}`);
      return response.data;
    } catch (error) {
      handleNodeRedError(error, `getNodeType(${nodeId})`);
    }
  }

  /**
   * Enable node type
   */
  async enableNodeType(nodeId: string): Promise<void> {
    try {
      await this.client.put(`/nodes/${nodeId}`, { enabled: true });
    } catch (error) {
      handleNodeRedError(error, `enableNodeType(${nodeId})`);
    }
  }

  /**
   * Disable node type
   */
  async disableNodeType(nodeId: string): Promise<void> {
    try {
      await this.client.put(`/nodes/${nodeId}`, { enabled: false });
    } catch (error) {
      handleNodeRedError(error, `disableNodeType(${nodeId})`);
    }
  }

  /**
   * Install node module
   */
  async installNodeModule(moduleName: string, version?: string): Promise<void> {
    try {
      const body = version ? `${moduleName}@${version}` : moduleName;
      await this.client.post('/nodes', { module: body });
    } catch (error) {
      handleNodeRedError(error, `installNodeModule(${moduleName})`);
    }
  }

  /**
   * Uninstall node module
   */
  async uninstallNodeModule(moduleName: string): Promise<void> {
    try {
      await this.client.delete(`/nodes/${moduleName}`);
    } catch (error) {
      handleNodeRedError(error, `uninstallNodeModule(${moduleName})`);
    }
  }

  // === Runtime Information ===

  /**
   * Get runtime settings
   */
  async getSettings(): Promise<NodeRedSettings> {
    try {
      const response = await this.client.get('/settings');
      return response.data;
    } catch (error) {
      handleNodeRedError(error, 'getSettings');
    }
  }

  /**
   * Get runtime information
   */
  async getRuntimeInfo(): Promise<NodeRedRuntimeInfo> {
    try {
      const response = await this.client.get('/admin/info');
      return response.data;
    } catch (error) {
      handleNodeRedError(error, 'getRuntimeInfo');
    }
  }

  /**
   * Get flow status
   */
  async getFlowStatus(): Promise<NodeRedFlowStatus> {
    try {
      const response = await this.client.get('/flows/state');
      return response.data;
    } catch (error) {
      handleNodeRedError(error, 'getFlowStatus');
    }
  }

  /**
   * Start flows
   */
  async startFlows(): Promise<void> {
    try {
      await this.client.post('/flows/state', { state: 'start' });
    } catch (error) {
      handleNodeRedError(error, 'startFlows');
    }
  }

  /**
   * Stop flows
   */
  async stopFlows(): Promise<void> {
    try {
      await this.client.post('/flows/state', { state: 'stop' });
    } catch (error) {
      handleNodeRedError(error, 'stopFlows');
    }
  }

  // === Context and Global Variables ===

  /**
   * Get global context
   */
  async getGlobalContext(key?: string): Promise<any> {
    try {
      const url = key ? `/context/global/${key}` : '/context/global';
      const response = await this.client.get(url);
      return response.data;
    } catch (error) {
      handleNodeRedError(error, `getGlobalContext(${key || 'all'})`);
    }
  }

  /**
   * Set global context value
   */
  async setGlobalContext(key: string, value: any): Promise<void> {
    try {
      await this.client.put(`/context/global/${key}`, { value });
    } catch (error) {
      handleNodeRedError(error, `setGlobalContext(${key})`);
    }
  }

  /**
   * Delete global context key
   */
  async deleteGlobalContext(key: string): Promise<void> {
    try {
      await this.client.delete(`/context/global/${key}`);
    } catch (error) {
      handleNodeRedError(error, `deleteGlobalContext(${key})`);
    }
  }

  /**
   * Get flow context
   */
  async getFlowContext(flowId: string, key?: string): Promise<any> {
    try {
      const url = key ? `/context/flow/${flowId}/${key}` : `/context/flow/${flowId}`;
      const response = await this.client.get(url);
      return response.data;
    } catch (error) {
      handleNodeRedError(error, `getFlowContext(${flowId}, ${key || 'all'})`);
    }
  }

  /**
   * Set flow context value
   */
  async setFlowContext(flowId: string, key: string, value: any): Promise<void> {
    try {
      await this.client.put(`/context/flow/${flowId}/${key}`, { value });
    } catch (error) {
      handleNodeRedError(error, `setFlowContext(${flowId}, ${key})`);
    }
  }

  // === Library Management ===

  /**
   * Get library entries
   */
  async getLibraryEntries(type = 'flows'): Promise<any[]> {
    try {
      const response = await this.client.get(`/library/${type}`);
      return response.data;
    } catch (error) {
      handleNodeRedError(error, `getLibraryEntries(${type})`);
    }
  }

  /**
   * Save to library
   */
  async saveToLibrary(type: string, path: string, data: any): Promise<void> {
    try {
      await this.client.post(`/library/${type}/${path}`, data);
    } catch (error) {
      handleNodeRedError(error, `saveToLibrary(${type}, ${path})`);
    }
  }

  /**
   * Load from library
   */
  async loadFromLibrary(type: string, path: string): Promise<any> {
    try {
      const response = await this.client.get(`/library/${type}/${path}`);
      return response.data;
    } catch (error) {
      handleNodeRedError(error, `loadFromLibrary(${type}, ${path})`);
    }
  }

  // === Authentication and Authorization ===

  /**
   * Login to Node-RED (if auth is enabled)
   */
  async login(username: string, password: string): Promise<{ access_token: string }> {
    try {
      const response = await this.client.post('/auth/token', {
        client_id: 'node-red-admin',
        grant_type: 'password',
        scope: '*',
        username,
        password,
      });
      return response.data;
    } catch (error) {
      handleNodeRedError(error, 'login');
    }
  }

  /**
   * Refresh authentication token
   */
  async refreshToken(refreshToken: string): Promise<{ access_token: string }> {
    try {
      const response = await this.client.post('/auth/token', {
        client_id: 'node-red-admin',
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
      });
      return response.data;
    } catch (error) {
      handleNodeRedError(error, 'refreshToken');
    }
  }

  /**
   * Get current authentication status
   */
  async getAuthStatus(): Promise<any> {
    try {
      const response = await this.client.get('/auth/login');
      return response.data;
    } catch (error) {
      handleNodeRedError(error, 'getAuthStatus');
    }
  }

  /**
   * Search for Node-RED modules online
   */
  async searchModules(
    query: string,
    category: 'all' | 'contrib' | 'dashboard' = 'all',
    limit = 10
  ): Promise<ModuleSearchResult> {
    try {
      // Search npm registry for node-red modules
      const searchQuery =
        category === 'contrib'
          ? `node-red-contrib ${query}`
          : category === 'dashboard'
            ? `node-red-dashboard ${query}`
            : `node-red ${query}`;

      const response = await axios.get(`https://registry.npmjs.org/-/v1/search`, {
        params: {
          text: searchQuery,
          size: limit,
          quality: 0.65,
          popularity: 0.98,
          maintenance: 0.5,
        },
        timeout: 10000,
      });

      const modules: NodeRedModule[] = response.data.objects
        .filter(
          (pkg: any) =>
            pkg.package.name.startsWith('node-red') ||
            pkg.package.keywords?.some((k: string) => k.includes('node-red'))
        )
        .map((pkg: any) => ({
          name: pkg.package.name,
          version: pkg.package.version,
          description: pkg.package.description,
          author: pkg.package.author?.name || pkg.package.publisher?.name,
          keywords: pkg.package.keywords || [],
          repository: pkg.package.links?.repository,
          downloads: pkg.score?.detail?.popularity,
          updated: pkg.package.date,
        }));

      return {
        modules,
        total: modules.length,
        query: searchQuery,
      };
    } catch (error) {
      handleNodeRedError(error, `searchModules(${query})`);
    }
  }

  /**
   * Install a Node-RED module via palette management
   */
  async installModule(moduleName: string, version?: string): Promise<ModuleInstallResult> {
    try {
      const moduleToInstall = version ? `${moduleName}@${version}` : moduleName;

      const response = await this.client.post('/nodes', {
        module: moduleToInstall,
      });

      return {
        success: true,
        module: moduleName,
        version: version ?? undefined,
        message: `Module ${moduleToInstall} installed successfully`,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return {
        success: false,
        module: moduleName,
        version: version ?? undefined,
        message: `Failed to install ${moduleName}: ${errorMessage}`,
      };
    }
  }

  /**
   * Get installed Node-RED modules
   */
  async getInstalledModules(): Promise<NodeRedModule[]> {
    try {
      const response = await this.client.get('/nodes');
      const nodes = response.data;

      // Group nodes by module
      const moduleMap = new Map<string, NodeRedModule>();

      for (const node of nodes) {
        if (node.module && node.module !== 'node-red') {
          if (!moduleMap.has(node.module)) {
            moduleMap.set(node.module, {
              name: node.module,
              version: node.version || 'unknown',
              description: `Module containing ${node.name} node type`,
            });
          }
        }
      }

      return Array.from(moduleMap.values());
    } catch (error) {
      handleNodeRedError(error, 'getInstalledModules');
    }
  }

  // === Utility Methods ===

  /**
   * Get Node-RED version information
   */
  async getVersion(): Promise<string> {
    try {
      const info = await this.getRuntimeInfo();
      return info.version;
    } catch (error) {
      handleNodeRedError(error, 'getVersion');
    }
  }

  /**
   * Check if Node-RED is healthy
   */
  async healthCheck(): Promise<{ healthy: boolean; details: any }> {
    try {
      const [settings, flows, runtime] = await Promise.all([
        this.getSettings(),
        this.getFlows(),
        this.getRuntimeInfo(),
      ]);

      return {
        healthy: true,
        details: {
          version: runtime.version,
          flowCount: flows.length,
          nodeCount: Object.keys(runtime.nodes).length,
          memory: runtime.memory,
        },
      };
    } catch (error) {
      return {
        healthy: false,
        details: {
          error: error instanceof Error ? error.message : 'Unknown error',
        },
      };
    }
  }
}
