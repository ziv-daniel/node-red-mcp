/**
 * Integration tests for pagination + enriched filters across the 4 paginatable tools:
 *   get_flows, search_flows, get_installed_modules, get_flow_state.
 *
 * Backwards-compat contract verified here:
 *   - Tools return their LEGACY shape when no pagination params are passed
 *     (array for get_flows; { matches, total } for search_flows; raw text dump
 *     for get_installed_modules; raw status for get_flow_state).
 *   - Tools wrap output in the pagination envelope only when limit/offset (or,
 *     for get_installed_modules, query) is provided.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

import { McpNodeRedServer } from './mcp-server.js';

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

vi.mock('../services/nodered-api.js', () => ({
  NodeRedAPIClient: class {
    constructor() {
      return mockNodeRedClient;
    }
  },
}));

vi.mock('./sse-handler.js', () => ({
  SSEHandler: class {
    constructor() {
      return mockSSEHandler;
    }
  },
}));

vi.mock('@modelcontextprotocol/sdk/server/index.js', () => ({
  Server: class {
    handlers = new Map();
    setRequestHandler = vi.fn((schema: any, handler: any) => {
      this.handlers.set(schema, handler);
    });
    connect = vi.fn();
  },
}));

function parse(result: any) {
  return JSON.parse(result.content[0].text);
}

describe('Pagination + filters', () => {
  let mcp: McpNodeRedServer;

  beforeEach(() => {
    vi.clearAllMocks();
    mockNodeRedClient.testConnection.mockResolvedValue(true);
    mcp = new McpNodeRedServer();
  });

  describe('get_flows', () => {
    const summaries = [
      { id: 'b', label: 'Beta', nodeCount: 5, disabled: false },
      { id: 'a', label: 'Alpha', nodeCount: 2, disabled: true },
      { id: 'c', label: 'Charlie alpha', nodeCount: 8, disabled: false },
      { id: 'd', label: 'Delta', nodeCount: 1, disabled: false },
    ];

    beforeEach(() => {
      mockNodeRedClient.getFlowSummaries.mockResolvedValue(summaries);
      mockNodeRedClient.getFlows.mockResolvedValue(summaries);
    });

    it('returns a plain array when no pagination params (legacy shape)', async () => {
      const parsed = parse(await mcp.callTool('get_flows', {}));
      expect(parsed.success).toBe(true);
      expect(Array.isArray(parsed.data)).toBe(true);
      expect(parsed.data).toHaveLength(4);
    });

    it('returns pagination envelope when limit is provided', async () => {
      const parsed = parse(await mcp.callTool('get_flows', { limit: 2 }));
      expect(parsed.data).toMatchObject({
        total: 4,
        limit: 2,
        offset: 0,
        hasMore: true,
      });
      expect(parsed.data.items).toHaveLength(2);
    });

    it('returns pagination envelope when offset is provided', async () => {
      const parsed = parse(await mcp.callTool('get_flows', { offset: 3 }));
      expect(parsed.data.items).toHaveLength(1);
      expect(parsed.data.hasMore).toBe(false);
    });

    it('filters by disabled state', async () => {
      const parsed = parse(await mcp.callTool('get_flows', { disabled: true }));
      expect(parsed.data).toHaveLength(1);
      expect(parsed.data[0].id).toBe('a');
    });

    it('filters by labelContains (case-insensitive)', async () => {
      const parsed = parse(await mcp.callTool('get_flows', { labelContains: 'alpha' }));
      const ids = parsed.data.map((f: any) => f.id).sort();
      expect(ids).toEqual(['a', 'c']);
    });

    it('sorts by label ascending', async () => {
      const parsed = parse(await mcp.callTool('get_flows', { sortBy: 'label' }));
      expect(parsed.data.map((f: any) => f.id)).toEqual(['a', 'b', 'c', 'd']);
    });

    it('sorts by nodeCount descending', async () => {
      const parsed = parse(await mcp.callTool('get_flows', { sortBy: 'nodeCount', order: 'desc' }));
      expect(parsed.data.map((f: any) => f.id)).toEqual(['c', 'b', 'a', 'd']);
    });

    it('returns an error result on invalid sortBy', async () => {
      const parsed = parse(await mcp.callTool('get_flows', { sortBy: 'bogus' }));
      expect(parsed.success).toBe(false);
      expect(parsed.error).toMatch(/Invalid sortBy/);
    });

    it('returns an error result on invalid limit (not 500)', async () => {
      const parsed = parse(await mcp.callTool('get_flows', { limit: 9999 }));
      expect(parsed.success).toBe(false);
      expect(parsed.error).toMatch(/Invalid limit/);
    });

    it('combines filter + sort + pagination deterministically', async () => {
      const parsed = parse(
        await mcp.callTool('get_flows', {
          labelContains: 'l',
          sortBy: 'label',
          order: 'asc',
          limit: 1,
          offset: 1,
        })
      );
      expect(parsed.data.total).toBe(3);
      expect(parsed.data.items).toHaveLength(1);
      expect(parsed.data.items[0].id).toBe('c');
    });
  });

  describe('search_flows', () => {
    const manyNodes = Array.from({ length: 15 }, (_, i) => ({
      id: `fn-${i}`,
      type: 'function',
      name: `Func ${i}`,
      z: 'tab-1',
    }));
    const namespacedNodes = [
      { id: 'm1', type: 'mqtt out', name: 'pub', z: 'tab-2' },
      { id: 'm2', type: 'mqtt in', name: 'sub', z: 'tab-2' },
      { id: 'd1', type: 'debug', name: 'd', z: 'tab-3' },
    ];

    beforeEach(() => {
      mockNodeRedClient.getFlows.mockResolvedValue([
        { id: 'tab-1', type: 'tab', label: 'Big', nodes: manyNodes },
        {
          id: 'tab-2',
          type: 'tab',
          label: 'MQTT',
          nodes: [namespacedNodes[0], namespacedNodes[1]],
        },
        { id: 'tab-3', type: 'tab', label: 'Debug', nodes: [namespacedNodes[2]] },
      ]);
    });

    it('preserves legacy 10-cap when no pagination params', async () => {
      const parsed = parse(await mcp.callTool('search_flows', { type: 'function' }));
      expect(parsed.data.matches).toHaveLength(10);
      expect(parsed.data.total).toBe(15);
    });

    it('replaces 10-cap with envelope when limit is set', async () => {
      const parsed = parse(await mcp.callTool('search_flows', { type: 'function', limit: 12 }));
      expect(parsed.data.items).toHaveLength(12);
      expect(parsed.data.total).toBe(15);
      expect(parsed.data.hasMore).toBe(true);
    });

    it('paginates with offset', async () => {
      const parsed = parse(
        await mcp.callTool('search_flows', { type: 'function', limit: 5, offset: 10 })
      );
      expect(parsed.data.items).toHaveLength(5);
      expect(parsed.data.offset).toBe(10);
      expect(parsed.data.hasMore).toBe(false);
    });

    it('filters by nodeTypePrefix', async () => {
      const parsed = parse(await mcp.callTool('search_flows', { nodeTypePrefix: 'mqtt' }));
      expect(parsed.data.total).toBe(2);
      expect(parsed.data.matches.every((m: any) => m.nodeType.startsWith('mqtt'))).toBe(true);
    });

    it('excludes flows via excludeFlowIds', async () => {
      const parsed = parse(
        await mcp.callTool('search_flows', {
          nodeTypePrefix: 'mqtt',
          excludeFlowIds: ['tab-2'],
        })
      );
      expect(parsed.data.total).toBe(0);
    });

    it('accepts nodeTypePrefix alone as a valid search parameter', async () => {
      const parsed = parse(await mcp.callTool('search_flows', { nodeTypePrefix: 'deb' }));
      expect(parsed.success).toBe(true);
      expect(parsed.data.total).toBe(1);
      expect(parsed.data.matches[0].nodeId).toBe('d1');
    });
  });

  describe('get_installed_modules', () => {
    const modules = [
      { name: 'node-red-contrib-mqtt' },
      { name: 'node-red-dashboard' },
      { name: 'node-red-contrib-influxdb' },
      { name: 'node-red-node-email' },
    ];

    beforeEach(() => {
      mockNodeRedClient.getInstalledModules.mockResolvedValue(modules);
    });

    it('returns raw JSON dump when no pagination/query params (legacy)', async () => {
      const result = await mcp.callTool('get_installed_modules', {});
      const text = result.content[0].text;
      const parsed = JSON.parse(text);
      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed).toHaveLength(4);
    });

    it('returns envelope when limit is provided', async () => {
      const parsed = parse(await mcp.callTool('get_installed_modules', { limit: 2 }));
      expect(parsed.success).toBe(true);
      expect(parsed.data.items).toHaveLength(2);
      expect(parsed.data.total).toBe(4);
      expect(parsed.data.hasMore).toBe(true);
    });

    it('filters by query and returns envelope', async () => {
      const parsed = parse(await mcp.callTool('get_installed_modules', { query: 'contrib' }));
      expect(parsed.success).toBe(true);
      expect(parsed.data.total).toBe(2);
      expect(parsed.data.items.every((m: any) => m.name.includes('contrib'))).toBe(true);
    });

    it('combines query + pagination', async () => {
      const parsed = parse(
        await mcp.callTool('get_installed_modules', { query: 'node-red', limit: 1, offset: 1 })
      );
      expect(parsed.data.total).toBe(4);
      expect(parsed.data.items).toHaveLength(1);
      expect(parsed.data.offset).toBe(1);
    });

    it('handles string module entries', async () => {
      mockNodeRedClient.getInstalledModules.mockResolvedValueOnce([
        'node-red-contrib-foo',
        'node-red-bar',
      ]);
      const parsed = parse(await mcp.callTool('get_installed_modules', { query: 'contrib' }));
      expect(parsed.data.items).toEqual(['node-red-contrib-foo']);
    });
  });

  describe('get_flow_state', () => {
    const status = {
      state: 'start',
      flows: Array.from({ length: 6 }, (_, i) => ({ id: `f-${i}`, state: 'running' })),
    };

    beforeEach(() => {
      mockNodeRedClient.getFlowStatus.mockResolvedValue(status);
    });

    it('returns raw status when no pagination params (legacy)', async () => {
      const parsed = parse(await mcp.callTool('get_flow_state', {}));
      expect(parsed.success).toBe(true);
      expect(parsed.data.state).toBe('start');
      expect(parsed.data.flows).toHaveLength(6);
    });

    it('wraps flows in envelope when limit is set, preserving top-level state', async () => {
      const parsed = parse(await mcp.callTool('get_flow_state', { limit: 2 }));
      expect(parsed.data.state).toBe('start');
      expect(parsed.data.items).toHaveLength(2);
      expect(parsed.data.total).toBe(6);
      expect(parsed.data.hasMore).toBe(true);
    });

    it('paginates via offset', async () => {
      const parsed = parse(await mcp.callTool('get_flow_state', { limit: 3, offset: 4 }));
      expect(parsed.data.items).toHaveLength(2);
      expect(parsed.data.offset).toBe(4);
      expect(parsed.data.hasMore).toBe(false);
    });

    it('returns error result on invalid offset', async () => {
      const parsed = parse(await mcp.callTool('get_flow_state', { offset: -1 }));
      expect(parsed.success).toBe(false);
      expect(parsed.error).toMatch(/Invalid offset/);
    });
  });
});
