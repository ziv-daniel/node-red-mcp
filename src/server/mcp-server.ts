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

import { promptRegistry } from '../prompts/index.js';
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
import type { NodeRedCredentials } from '../types/oauth.js';
import { validateRequired, validateTypes } from '../utils/error-handling.js';

import { applyPagination, isPaginated, stableSortBy } from './pagination.js';
import { SSEHandler } from './sse-handler.js';

const SEARCH_RESULTS_LIMIT = 10;
const SEARCH_SKIP_PROPS = new Set(['id', 'z', 'x', 'y', 'wires']);

interface FlowSearchMatch {
  nodeId: string;
  nodeType: string;
  nodeName: string;
  flowId: string;
  flowLabel: string;
}

interface FlowValidationResult {
  valid: boolean;
  errors: string[];
}

function validateFlowData(flow: { nodes?: unknown[] }): FlowValidationResult {
  const errors: string[] = [];
  const nodes = Array.isArray(flow?.nodes) ? (flow.nodes as Record<string, unknown>[]) : [];
  const nodeIds = new Set<string>();

  for (const [i, node] of nodes.entries()) {
    const id = typeof node.id === 'string' ? node.id : '';
    const label = id ? `Node "${id}"` : `Node[${i}]`;

    if (!id) errors.push(`${label}: missing required field "id"`);
    if (!node.type) errors.push(`${label}: missing required field "type"`);

    if (id) {
      if (nodeIds.has(id)) {
        errors.push(`Duplicate node ID: "${id}"`);
      } else {
        nodeIds.add(id);
      }
    }
  }

  for (const [i, node] of nodes.entries()) {
    const id = typeof node.id === 'string' ? node.id : '';
    const label = id ? `Node "${id}"` : `Node[${i}]`;
    if (!Array.isArray(node.wires)) continue;
    for (const group of node.wires as unknown[]) {
      if (!Array.isArray(group)) {
        errors.push(`${label}: wires must be an array of arrays`);
        continue;
      }
      for (const target of group as unknown[]) {
        if (typeof target !== 'string') {
          errors.push(`${label}: wire target must be a string`);
          continue;
        }
        if (!nodeIds.has(target)) {
          errors.push(`${label}: wire references unknown node "${target}"`);
        }
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

function validateFlowOrThrow(flowData: { nodes?: unknown[] }): void {
  const validation = validateFlowData(flowData);
  if (!validation.valid) {
    throw new Error(`Validation failed:\n${validation.errors.map(e => `- ${e}`).join('\n')}`);
  }
}

const FLOW_SORT_KEYS = ['label', 'nodeCount', 'disabled'] as const;
type FlowSortKey = (typeof FLOW_SORT_KEYS)[number];

function flowSortKeyFn(field: FlowSortKey): (f: any) => string | number | boolean {
  if (field === 'label') return (f: any) => String(f?.label ?? '').toLowerCase();
  if (field === 'nodeCount')
    return (f: any) => (typeof f?.nodeCount === 'number' ? f.nodeCount : (f?.nodes?.length ?? 0));
  return (f: any) => Boolean(f?.disabled);
}

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
        heartbeatInterval: parseInt(process.env.SSE_HEARTBEAT_INTERVAL || '30000'),
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
      }
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

    this.server.setRequestHandler(CallToolRequestSchema, async request => {
      const { name, arguments: args } = request.params;
      return await this.callTool(name, args || {});
    });

    // Resources handlers
    this.server.setRequestHandler(ListResourcesRequestSchema, async () => ({
      resources: await this.getResourceList(),
    }));

    this.server.setRequestHandler(ReadResourceRequestSchema, async request => {
      const { uri } = request.params;
      return await this.getResource(uri);
    });

    // Prompts handlers
    this.server.setRequestHandler(ListPromptsRequestSchema, async () => ({
      prompts: this.getPromptDefinitions(),
    }));

    this.server.setRequestHandler(GetPromptRequestSchema, async request => {
      const { name, arguments: args } = request.params;
      const rendered = await this.getPrompt(name, args || {});
      return { description: rendered.description, messages: rendered.messages };
    });
  }

  /**
   * Get tool definitions
   */
  public getToolDefinitions() {
    return [
      // Core Flow Management Tools (Optimized)
      {
        name: 'get_flows',
        description:
          'Get Node-RED flows with flexible filtering (summary info by default, use includeDetails for full data). Supports pagination (limit/offset), sorting (label/nodeCount/disabled), and filtering by disabled state or label substring.',
        annotations: { readOnlyHint: true },
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
            limit: {
              type: 'number',
              description:
                'Maximum items to return (1-500). When set, response is wrapped in pagination envelope { items, total, limit, offset, hasMore }.',
              minimum: 1,
              maximum: 500,
            },
            offset: {
              type: 'number',
              description:
                'Items to skip. When set, response is wrapped in pagination envelope.',
              minimum: 0,
            },
            sortBy: {
              type: 'string',
              enum: ['label', 'nodeCount', 'disabled'],
              description:
                'Sort key. Secondary sort by id keeps slice boundaries deterministic.',
            },
            order: {
              type: 'string',
              enum: ['asc', 'desc'],
              description: 'Sort order (default: asc).',
              default: 'asc',
            },
            disabled: {
              type: 'boolean',
              description:
                'Filter by disabled state (true = only disabled, false = only enabled).',
            },
            labelContains: {
              type: 'string',
              description: 'Case-insensitive substring filter on flow label.',
            },
          },
          required: [],
        },
      },
      {
        name: 'get_flow',
        description: 'Get specific Node-RED flow by ID',
        annotations: { readOnlyHint: true },
        inputSchema: {
          type: 'object',
          properties: {
            flowId: { type: 'string', description: 'Flow ID to retrieve' },
          },
          required: ['flowId'],
        },
      },
      {
        name: 'validate_flow',
        description:
          'Validate a Node-RED flow for structural errors: missing required node fields, duplicate node IDs, and wire references to non-existent nodes.',
        annotations: { readOnlyHint: true },
        inputSchema: {
          type: 'object',
          properties: {
            flowId: { type: 'string', description: 'ID of the flow to fetch and validate' },
          },
          required: ['flowId'],
        },
      },
      {
        name: 'create_flow',
        description: 'Create a new Node-RED flow',
        annotations: { readOnlyHint: false },
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
            validate: {
              type: 'boolean',
              description: 'If true, validate flowData for structural errors before creating',
              default: false,
            },
          },
          required: ['flowData'],
        },
      },
      {
        name: 'update_flow',
        description: 'Update an existing Node-RED flow',
        annotations: { readOnlyHint: false },
        inputSchema: {
          type: 'object',
          properties: {
            flowId: { type: 'string', description: 'Flow ID to update' },
            flowData: { type: 'object', description: 'Updated flow data' },
            validate: {
              type: 'boolean',
              description: 'If true, validate flowData for structural errors before updating',
              default: false,
            },
          },
          required: ['flowId', 'flowData'],
        },
      },
      {
        name: 'enable_flow',
        description: 'Enable a specific Node-RED flow',
        annotations: { readOnlyHint: false },
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
        annotations: { readOnlyHint: false },
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
        description: 'Search for Node-RED palette modules online via npm registry',
        annotations: { readOnlyHint: true },
        inputSchema: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'Search query for modules (e.g., "mqtt", "dashboard", "influxdb")',
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
        description: 'Install a Node-RED palette module via Node-RED palette management API',
        annotations: { readOnlyHint: false },
        inputSchema: {
          type: 'object',
          properties: {
            moduleName: {
              type: 'string',
              description: 'Name of the module to install (e.g., "node-red-contrib-ui-led")',
            },
            version: {
              type: 'string',
              description: 'Specific version to install (optional, defaults to latest)',
            },
          },
          required: ['moduleName'],
        },
      },
      {
        name: 'get_installed_modules',
        description:
          'Get list of currently installed Node-RED palette modules. Supports pagination (limit/offset) and a case-insensitive substring filter (query). When any of these is provided, response is wrapped in pagination envelope.',
        annotations: { readOnlyHint: true },
        inputSchema: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'Case-insensitive substring filter on module name.',
            },
            limit: {
              type: 'number',
              description: 'Maximum items to return (1-500).',
              minimum: 1,
              maximum: 500,
            },
            offset: {
              type: 'number',
              description: 'Items to skip.',
              minimum: 0,
            },
          },
          required: [],
        },
      },
      {
        name: 'get_context',
        description: 'Read Node-RED context variables (global or flow scope).',
        annotations: { readOnlyHint: true },
        inputSchema: {
          type: 'object',
          properties: {
            scope: {
              type: 'string',
              enum: ['global', 'flow'],
              description: 'Context scope (default: "global")',
              default: 'global',
            },
            key: {
              type: 'string',
              description: 'Variable name to read. Omit to return all variables in this scope.',
            },
            flowId: {
              type: 'string',
              description: 'Flow tab ID (required when scope is "flow")',
            },
          },
          required: [],
        },
      },
      {
        name: 'set_context',
        description: 'Write a Node-RED context variable.',
        annotations: { readOnlyHint: false },
        inputSchema: {
          type: 'object',
          properties: {
            scope: {
              type: 'string',
              enum: ['global', 'flow'],
              description: 'Context scope (default: "global")',
              default: 'global',
            },
            key: {
              type: 'string',
              description: 'Variable name to write',
            },
            value: {
              description: 'Value to store (any JSON-serialisable type)',
            },
            flowId: {
              type: 'string',
              description: 'Flow tab ID (required when scope is "flow")',
            },
          },
          required: ['key', 'value'],
        },
      },
      {
        name: 'delete_context',
        description: 'Delete a Node-RED global context variable.',
        annotations: { readOnlyHint: false },
        inputSchema: {
          type: 'object',
          properties: {
            key: {
              type: 'string',
              description: 'Variable name to delete',
            },
          },
          required: ['key'],
        },
      },
      {
        name: 'delete_flow',
        description:
          'Delete a Node-RED flow. Default is dry-run — shows what would be deleted without acting. To delete for real: set dryRun: false AND confirm: true.',
        annotations: { readOnlyHint: false, destructiveHint: true },
        inputSchema: {
          type: 'object',
          properties: {
            flowId: {
              type: 'string',
              description: 'ID of the flow to delete',
            },
            dryRun: {
              type: 'boolean',
              description: 'When true (default), returns flow details without deleting',
              default: true,
            },
            confirm: {
              type: 'boolean',
              description:
                'Must be true when dryRun is false — explicit confirmation of destructive action',
            },
          },
          required: ['flowId'],
        },
      },
      {
        name: 'search_flows',
        description:
          'Search for nodes in Node-RED flows by type, name, or property value. At least one search parameter is required. Supports pagination (limit/offset replaces the internal 10-cap), node type prefix filter, and flow exclusion list.',
        annotations: { readOnlyHint: true },
        inputSchema: {
          type: 'object',
          properties: {
            type: {
              type: 'string',
              description:
                'Substring match on node type (case-insensitive, e.g. "function", "mqtt")',
            },
            query: {
              type: 'string',
              description:
                'Substring match on node name or any string property value (case-insensitive)',
            },
            flowId: {
              type: 'string',
              description: 'Restrict search to a specific flow ID',
            },
            nodeTypePrefix: {
              type: 'string',
              description:
                'Case-insensitive prefix match on node type — useful for namespaced types.',
            },
            excludeFlowIds: {
              type: 'array',
              items: { type: 'string' },
              description: 'Exclude these flow IDs from the search.',
            },
            limit: {
              type: 'number',
              description:
                'Maximum matches to return (1-500). When set, replaces the default 10-cap and wraps response in pagination envelope.',
              minimum: 1,
              maximum: 500,
            },
            offset: {
              type: 'number',
              description:
                'Matches to skip. When set, response is wrapped in pagination envelope.',
              minimum: 0,
            },
          },
          required: [],
        },
      },
      {
        name: 'get_flow_state',
        description:
          'Get the runtime state of Node-RED flows (running or stopped). Supports pagination over the per-flow array via limit/offset.',
        annotations: { readOnlyHint: true },
        inputSchema: {
          type: 'object',
          properties: {
            limit: {
              type: 'number',
              description:
                'Maximum flows to return (1-500). When set, response is wrapped in pagination envelope (state remains at top level).',
              minimum: 1,
              maximum: 500,
            },
            offset: {
              type: 'number',
              description: 'Flows to skip.',
              minimum: 0,
            },
          },
          required: [],
        },
      },
      {
        name: 'get_settings',
        description: 'Get Node-RED runtime settings (HTTP root paths, logging configuration, etc.)',
        annotations: { readOnlyHint: true },
        inputSchema: { type: 'object', properties: {}, required: [] },
      },
      {
        name: 'get_runtime_info',
        description:
          'Get Node-RED runtime information including version, installed node types, and memory usage',
        annotations: { readOnlyHint: true },
        inputSchema: { type: 'object', properties: {}, required: [] },
      },
    ];
  }

  /**
   * Call a specific tool
   */
  public async callTool(name: string, args: any): Promise<{ content: any[] }> {
    const timestamp = new Date().toISOString();
    let result: McpToolResult;

    try {
      switch (name) {
        // Core Flow Management Tools
        case 'get_flows': {
          const includeDetails = args?.includeDetails || false;
          const types = args?.types || ['tab', 'subflow'];
          let flowData: any[] = includeDetails
            ? await this.nodeRedClient.getFlows()
            : await this.nodeRedClient.getFlowSummaries(types);

          const sortBy = args?.sortBy as string | undefined;
          const order = args?.order as string | undefined;
          if (sortBy !== undefined && !FLOW_SORT_KEYS.includes(sortBy as FlowSortKey)) {
            throw new Error(
              `Invalid sortBy: must be one of ${FLOW_SORT_KEYS.join(', ')}`
            );
          }
          if (order !== undefined && order !== 'asc' && order !== 'desc') {
            throw new Error('Invalid order: must be "asc" or "desc"');
          }

          if (args?.disabled !== undefined) {
            const wantDisabled = Boolean(args.disabled);
            flowData = flowData.filter((f: any) => Boolean(f?.disabled) === wantDisabled);
          }
          if (typeof args?.labelContains === 'string') {
            const q = args.labelContains.toLowerCase();
            flowData = flowData.filter((f: any) =>
              String(f?.label ?? '').toLowerCase().includes(q)
            );
          }

          if (sortBy) {
            flowData = stableSortBy(
              flowData,
              flowSortKeyFn(sortBy as FlowSortKey),
              order as 'asc' | 'desc' | undefined
            );
          }

          if (isPaginated(args)) {
            result = { success: true, data: applyPagination(flowData, args), timestamp };
          } else {
            result = { success: true, data: flowData, timestamp };
          }
          break;
        }

        case 'get_flow':
          validateRequired(args, ['flowId']);
          result = {
            success: true,
            data: await this.nodeRedClient.getFlow(args.flowId),
            timestamp,
          };
          break;

        case 'validate_flow': {
          validateRequired(args, ['flowId']);
          const flow = await this.nodeRedClient.getFlow(args.flowId);
          result = { success: true, data: validateFlowData(flow), timestamp };
          break;
        }

        case 'create_flow':
          validateRequired(args, ['flowData']);
          if (args?.validate) validateFlowOrThrow(args.flowData);
          const createdFlow = await this.nodeRedClient.createFlow(args.flowData);
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
          if (args?.validate) validateFlowOrThrow(args.flowData);
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
            searchLimit
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
          const installResult = await this.nodeRedClient.installModule(moduleName, moduleVersion);
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(installResult, null, 2),
              },
            ],
          };

        case 'get_installed_modules': {
          const installedModules = await this.nodeRedClient.getInstalledModules();
          const queryFilter = args?.query;
          const hasNewParams =
            isPaginated(args) || typeof queryFilter === 'string';

          if (!hasNewParams) {
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(installedModules, null, 2),
                },
              ],
            };
          }

          let modules: any[] = Array.isArray(installedModules) ? installedModules : [];
          if (typeof queryFilter === 'string') {
            const q = queryFilter.toLowerCase();
            modules = modules.filter((m: any) => {
              const name = typeof m === 'string' ? m : (m?.name ?? m?.id ?? '');
              return String(name).toLowerCase().includes(q);
            });
          }
          result = { success: true, data: applyPagination(modules, args), timestamp };
          break;
        }

        case 'get_context': {
          const scope = args?.scope || 'global';
          const key = args?.key;
          if (scope === 'flow') {
            validateRequired(args, ['flowId']);
          }
          const contextData =
            scope === 'flow'
              ? await this.nodeRedClient.getFlowContext(args.flowId, key)
              : await this.nodeRedClient.getGlobalContext(key);
          result = { success: true, data: contextData, timestamp };
          break;
        }

        case 'set_context': {
          validateRequired(args, ['key', 'value']);
          const scope = args?.scope || 'global';
          if (scope === 'flow') {
            validateRequired(args, ['flowId']);
            await this.nodeRedClient.setFlowContext(args.flowId, args.key, args.value);
          } else {
            await this.nodeRedClient.setGlobalContext(args.key, args.value);
          }
          result = { success: true, data: { scope, key: args.key }, timestamp };
          break;
        }

        case 'delete_context': {
          validateRequired(args, ['key']);
          await this.nodeRedClient.deleteGlobalContext(args.key);
          result = { success: true, data: { key: args.key }, timestamp };
          break;
        }

        case 'delete_flow': {
          validateRequired(args, ['flowId']);
          const dryRun = args?.dryRun !== false;
          const flow = await this.nodeRedClient.getFlow(args.flowId);
          const flowInfo = {
            id: flow.id,
            label: flow.label ?? '',
            nodeCount: flow.nodes?.length ?? 0,
          };

          if (dryRun) {
            result = { success: true, data: { dryRun: true, wouldDelete: flowInfo }, timestamp };
            break;
          }

          if (!args?.confirm) {
            throw new Error('Deletion requires confirm: true and dryRun: false');
          }

          await this.nodeRedClient.deleteFlow(args.flowId);
          result = { success: true, data: { deleted: flowInfo }, timestamp };
          break;
        }

        case 'search_flows': {
          const typeFilter = args?.type as string | undefined;
          const query = args?.query as string | undefined;
          const filterFlowId = args?.flowId as string | undefined;
          const nodeTypePrefix = args?.nodeTypePrefix as string | undefined;
          const excludeFlowIds = Array.isArray(args?.excludeFlowIds)
            ? new Set(args.excludeFlowIds as string[])
            : undefined;

          if (!typeFilter && !query && !filterFlowId && !nodeTypePrefix) {
            throw new Error(
              'At least one search parameter is required: type, query, flowId, or nodeTypePrefix'
            );
          }

          const flows = await this.nodeRedClient.getFlows();
          const typeFilterLower = typeFilter?.toLowerCase();
          const queryLower = query?.toLowerCase();
          const nodeTypePrefixLower = nodeTypePrefix?.toLowerCase();
          const allMatches: FlowSearchMatch[] = [];

          for (const flow of flows) {
            if (filterFlowId && flow.id !== filterFlowId) continue;
            if (excludeFlowIds?.has(flow.id)) continue;
            for (const node of flow.nodes ?? []) {
              const nodeTypeLower = node.type.toLowerCase();
              if (typeFilterLower && !nodeTypeLower.includes(typeFilterLower)) continue;
              if (nodeTypePrefixLower && !nodeTypeLower.startsWith(nodeTypePrefixLower)) continue;
              if (queryLower) {
                let matched = (node.name ?? '').toLowerCase().includes(queryLower);
                if (!matched) {
                  for (const k in node) {
                    if (SEARCH_SKIP_PROPS.has(k) || k === 'name') continue;
                    const v = (node as Record<string, unknown>)[k];
                    if (typeof v === 'string' && v.toLowerCase().includes(queryLower)) {
                      matched = true;
                      break;
                    }
                  }
                }
                if (!matched) continue;
              }
              allMatches.push({
                nodeId: node.id,
                nodeType: node.type,
                nodeName: node.name ?? '',
                flowId: flow.id,
                flowLabel: flow.label ?? '',
              });
            }
          }

          if (isPaginated(args)) {
            result = { success: true, data: applyPagination(allMatches, args), timestamp };
          } else {
            const total = allMatches.length;
            const matches = allMatches.slice(0, SEARCH_RESULTS_LIMIT);
            result = { success: true, data: { matches, total }, timestamp };
          }
          break;
        }

        case 'get_flow_state': {
          const status: any = await this.nodeRedClient.getFlowStatus();
          if (isPaginated(args)) {
            const flows = Array.isArray(status?.flows) ? status.flows : [];
            const envelope = applyPagination(flows, args);
            result = {
              success: true,
              data: { state: status?.state, ...envelope },
              timestamp,
            };
          } else {
            result = { success: true, data: status, timestamp };
          }
          break;
        }

        case 'get_settings': {
          result = { success: true, data: await this.nodeRedClient.getSettings(), timestamp };
          break;
        }

        case 'get_runtime_info': {
          result = { success: true, data: await this.nodeRedClient.getRuntimeInfo(), timestamp };
          break;
        }

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
  public async getResourceList() {
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
      // Error silently handled
    }

    return resources;
  }

  /**
   * Get specific resource
   */
  public async getResource(uri: string) {
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
   * Get prompt definitions (delegates to prompt registry)
   */
  private getPromptDefinitions() {
    return promptRegistry.list();
  }

  /**
   * Get specific prompt (delegates to prompt registry)
   */
  private async getPrompt(name: string, args: any) {
    return await promptRegistry.get(name, args);
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
    // Connection test completed silently

    // Server started silently
  }

  /**
   * Stop the MCP server
   */
  async stop(): Promise<void> {
    this.sseHandler.destroy();
    // Server stopped - logging disabled in stdio mode
  }

  /**
   * Public method to list tools (for HTTP API)
   */
  async listTools() {
    return { tools: this.getToolDefinitions() };
  }

  /**
   * Public method to call tools (for HTTP API)
   * Accepts optional per-request Node-RED credentials from the OAuth token.
   */
  async callToolPublic(name: string, args: any, nodeRedCredentials?: NodeRedCredentials) {
    if (nodeRedCredentials) {
      const savedClient = this.nodeRedClient;
      const authHeader =
        nodeRedCredentials.authType === 'basic'
          ? `Basic ${Buffer.from(`${nodeRedCredentials.username}:${nodeRedCredentials.password}`).toString('base64')}`
          : nodeRedCredentials.token
            ? `Bearer ${nodeRedCredentials.token}`
            : undefined;
      this.nodeRedClient = new NodeRedAPIClient({
        baseURL: nodeRedCredentials.url,
        headers: authHeader ? { Authorization: authHeader } : {},
      });
      try {
        return await this.callTool(name, args);
      } finally {
        this.nodeRedClient = savedClient;
      }
    }
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
