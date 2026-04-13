/**
 * Tests for NodeRedAPIClient
 *
 * Comprehensive tests for the Node-RED API client service
 */

import axios, { AxiosInstance, AxiosError } from 'axios';
import { describe, it, expect, beforeEach, afterEach, vi, Mock } from 'vitest';

import {
  mockFlows,
  mockFlowTab,
  mockFlowSummaries,
  mockFlowStatus,
  mockCreatedFlow,
  mockDisabledFlow,
} from '../../test/fixtures/flows.js';
import {
  mockSettings,
  mockRuntimeInfo,
  mockNodeTypes,
  mockInstalledModules,
  mockSearchResult,
  mockInstallSuccess,
  mockNpmSearchResponse,
  mockErrorResponses,
  mockGlobalContext,
  mockLibraryEntries,
  mockHealthCheck,
  mockAuthToken,
  mockAuthStatus,
} from '../../test/fixtures/responses.js';

import { NodeRedAPIClient } from './nodered-api.js';

// Mock axios
vi.mock('axios', () => {
  const mockAxiosInstance = {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
    interceptors: {
      request: { use: vi.fn() },
      response: { use: vi.fn() },
    },
  };

  return {
    default: {
      create: vi.fn(() => mockAxiosInstance),
      get: vi.fn(),
      isAxiosError: vi.fn((error: any) => error?.isAxiosError === true),
    },
  };
});

// Mock auth utility
vi.mock('../utils/auth.js', () => ({
  getNodeRedAuthHeader: vi.fn(() => ({})),
}));

describe('NodeRedAPIClient', () => {
  let client: NodeRedAPIClient;
  let mockAxiosInstance: any;

  beforeEach(() => {
    vi.clearAllMocks();

    // Setup environment
    process.env.NODERED_URL = 'http://localhost:1880';
    process.env.NODERED_TIMEOUT = '5000';
    process.env.NODERED_RETRIES = '3';

    // Get the mock instance
    client = new NodeRedAPIClient();
    mockAxiosInstance = (axios.create as Mock).mock.results[0]?.value;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Constructor and Configuration', () => {
    it('should create client with default configuration', () => {
      expect(client).toBeDefined();
      expect(axios.create).toHaveBeenCalledWith(
        expect.objectContaining({
          baseURL: 'http://localhost:1880',
          timeout: 5000,
        })
      );
    });

    it('should create client with custom configuration', () => {
      const customClient = new NodeRedAPIClient({
        baseURL: 'http://custom:8080',
        timeout: 10000,
        retries: 5,
      });

      expect(customClient).toBeDefined();
      expect(axios.create).toHaveBeenCalledWith(
        expect.objectContaining({
          baseURL: 'http://custom:8080',
          timeout: 10000,
        })
      );
    });

    it('should setup interceptors', () => {
      expect(mockAxiosInstance.interceptors.request.use).toHaveBeenCalled();
      expect(mockAxiosInstance.interceptors.response.use).toHaveBeenCalled();
    });
  });

  describe('Connection Testing', () => {
    it('should return true when connection succeeds', async () => {
      mockAxiosInstance.get.mockResolvedValueOnce({ data: 'OK' });

      const result = await client.testConnection();

      expect(result).toBe(true);
      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/');
    });

    it('should return false when connection fails', async () => {
      mockAxiosInstance.get.mockRejectedValueOnce(new Error('Connection refused'));

      const result = await client.testConnection();

      expect(result).toBe(false);
    });
  });

  describe('Flow Management', () => {
    describe('getFlows', () => {
      it('should return all flows', async () => {
        mockAxiosInstance.get.mockResolvedValueOnce({ data: mockFlows });

        const flows = await client.getFlows();

        expect(flows).toEqual(mockFlows);
        expect(mockAxiosInstance.get).toHaveBeenCalledWith('/flows');
      });

      it('should throw error when response is HTML', async () => {
        mockAxiosInstance.get.mockResolvedValueOnce({
          data: '<!DOCTYPE html><html>Node-RED</html>',
        });

        await expect(client.getFlows()).rejects.toThrow(/HTML content instead of flow data/);
      });
    });

    describe('getFlowSummaries', () => {
      it('should return flow summaries', async () => {
        mockAxiosInstance.get
          .mockResolvedValueOnce({ data: mockFlows }) // getFlows call
          .mockResolvedValueOnce({ data: mockFlowStatus }); // getFlowStatus call

        const summaries = await client.getFlowSummaries();

        expect(summaries).toBeDefined();
        expect(Array.isArray(summaries)).toBe(true);
      });

      it('should filter by requested types', async () => {
        mockAxiosInstance.get
          .mockResolvedValueOnce({ data: mockFlows })
          .mockResolvedValueOnce({ data: mockFlowStatus });

        const summaries = await client.getFlowSummaries(['tab']);

        expect(summaries).toBeDefined();
        // Should only include 'tab' type flows
        summaries.forEach(summary => {
          expect(summary).toBeDefined();
        });
      });

      it('should gracefully handle flow status errors', async () => {
        mockAxiosInstance.get
          .mockResolvedValueOnce({ data: mockFlows })
          .mockRejectedValueOnce(new Error('Status unavailable'));

        const summaries = await client.getFlowSummaries();

        expect(summaries).toBeDefined();
        expect(Array.isArray(summaries)).toBe(true);
      });
    });

    describe('getFlow', () => {
      it('should return specific flow by ID', async () => {
        mockAxiosInstance.get.mockResolvedValueOnce({ data: mockFlowTab });

        const flow = await client.getFlow('flow-1');

        expect(flow).toEqual(mockFlowTab);
        expect(mockAxiosInstance.get).toHaveBeenCalledWith('/flow/flow-1');
      });

      it('should throw error when flow not found', async () => {
        const error = {
          isAxiosError: true,
          response: mockErrorResponses.notFound,
        };
        mockAxiosInstance.get.mockRejectedValueOnce(error);

        await expect(client.getFlow('nonexistent')).rejects.toThrow();
      });
    });

    describe('createFlow', () => {
      it('should create a new flow', async () => {
        mockAxiosInstance.post.mockResolvedValueOnce({ data: mockCreatedFlow });

        const flow = await client.createFlow({ label: 'New Flow' });

        expect(flow).toEqual(mockCreatedFlow);
        expect(mockAxiosInstance.post).toHaveBeenCalledWith(
          '/flow',
          expect.objectContaining({
            label: 'New Flow',
            type: 'tab',
          })
        );
      });

      it('should generate unique flow ID if not provided', async () => {
        mockAxiosInstance.post.mockResolvedValueOnce({ data: mockCreatedFlow });

        await client.createFlow({ label: 'New Flow' });

        expect(mockAxiosInstance.post).toHaveBeenCalledWith(
          '/flow',
          expect.objectContaining({
            id: expect.any(String),
          })
        );
      });

      it('should preserve provided flow ID', async () => {
        mockAxiosInstance.post.mockResolvedValueOnce({ data: mockCreatedFlow });

        await client.createFlow({ id: 'custom-id', label: 'New Flow' });

        expect(mockAxiosInstance.post).toHaveBeenCalledWith(
          '/flow',
          expect.objectContaining({
            id: 'custom-id',
          })
        );
      });

      it('should ensure unique node IDs', async () => {
        mockAxiosInstance.post.mockResolvedValueOnce({ data: mockCreatedFlow });

        await client.createFlow({
          label: 'Flow with nodes',
          nodes: [
            { id: 'node-1', type: 'inject', x: 100, y: 100 },
            { id: 'node-2', type: 'debug', x: 200, y: 100 },
          ],
        });

        const callArgs = mockAxiosInstance.post.mock.calls[0][1];
        expect(callArgs.nodes[0].id).toBeDefined();
        expect(callArgs.nodes[1].id).toBeDefined();
        expect(callArgs.nodes[0].id).not.toBe(callArgs.nodes[1].id);
      });
    });

    describe('updateFlow', () => {
      it('should update an existing flow', async () => {
        mockAxiosInstance.put.mockResolvedValueOnce({ data: mockFlowTab });

        const flow = await client.updateFlow('flow-1', { label: 'Updated Label' });

        expect(flow).toEqual(mockFlowTab);
        expect(mockAxiosInstance.put).toHaveBeenCalledWith('/flow/flow-1', {
          label: 'Updated Label',
        });
      });
    });

    describe('deleteFlow', () => {
      it('should delete a flow', async () => {
        mockAxiosInstance.delete.mockResolvedValueOnce({ data: {} });

        await client.deleteFlow('flow-1');

        expect(mockAxiosInstance.delete).toHaveBeenCalledWith('/flow/flow-1');
      });
    });

    describe('deployFlows', () => {
      it('should deploy with default full type', async () => {
        mockAxiosInstance.post.mockResolvedValueOnce({ data: {} });

        await client.deployFlows();

        expect(mockAxiosInstance.post).toHaveBeenCalledWith('/flows', null, {
          headers: { 'Node-RED-Deployment-Type': 'full' },
        });
      });

      it('should deploy with specified type', async () => {
        mockAxiosInstance.post.mockResolvedValueOnce({ data: {} });

        await client.deployFlows({ type: 'nodes' });

        expect(mockAxiosInstance.post).toHaveBeenCalledWith('/flows', null, {
          headers: { 'Node-RED-Deployment-Type': 'nodes' },
        });
      });
    });

    describe('enableFlow', () => {
      it('should enable a flow and deploy', async () => {
        mockAxiosInstance.get.mockResolvedValueOnce({ data: mockDisabledFlow });
        mockAxiosInstance.put.mockResolvedValueOnce({
          data: { ...mockDisabledFlow, disabled: false },
        });
        mockAxiosInstance.post.mockResolvedValueOnce({ data: {} });

        await client.enableFlow('flow-disabled');

        expect(mockAxiosInstance.get).toHaveBeenCalledWith('/flow/flow-disabled');
        expect(mockAxiosInstance.put).toHaveBeenCalledWith(
          '/flow/flow-disabled',
          expect.objectContaining({ disabled: false })
        );
        expect(mockAxiosInstance.post).toHaveBeenCalledWith('/flows', null, {
          headers: { 'Node-RED-Deployment-Type': 'flows' },
        });
      });
    });

    describe('disableFlow', () => {
      it('should disable a flow and deploy', async () => {
        mockAxiosInstance.get.mockResolvedValueOnce({ data: mockFlowTab });
        mockAxiosInstance.put.mockResolvedValueOnce({ data: { ...mockFlowTab, disabled: true } });
        mockAxiosInstance.post.mockResolvedValueOnce({ data: {} });

        await client.disableFlow('flow-1');

        expect(mockAxiosInstance.get).toHaveBeenCalledWith('/flow/flow-1');
        expect(mockAxiosInstance.put).toHaveBeenCalledWith(
          '/flow/flow-1',
          expect.objectContaining({ disabled: true })
        );
      });
    });
  });

  describe('Node Management', () => {
    describe('getNodeTypes', () => {
      it('should return all node types', async () => {
        mockAxiosInstance.get.mockResolvedValueOnce({ data: mockNodeTypes });

        const nodeTypes = await client.getNodeTypes();

        expect(nodeTypes).toEqual(mockNodeTypes);
        expect(mockAxiosInstance.get).toHaveBeenCalledWith('/nodes');
      });
    });

    describe('getNodeType', () => {
      it('should return specific node type', async () => {
        mockAxiosInstance.get.mockResolvedValueOnce({ data: mockNodeTypes[0] });

        const nodeType = await client.getNodeType('node-red/inject');

        expect(nodeType).toEqual(mockNodeTypes[0]);
        expect(mockAxiosInstance.get).toHaveBeenCalledWith('/nodes/node-red/inject');
      });
    });

    describe('enableNodeType', () => {
      it('should enable a node type', async () => {
        mockAxiosInstance.put.mockResolvedValueOnce({ data: {} });

        await client.enableNodeType('node-red/inject');

        expect(mockAxiosInstance.put).toHaveBeenCalledWith('/nodes/node-red/inject', {
          enabled: true,
        });
      });
    });

    describe('disableNodeType', () => {
      it('should disable a node type', async () => {
        mockAxiosInstance.put.mockResolvedValueOnce({ data: {} });

        await client.disableNodeType('node-red/inject');

        expect(mockAxiosInstance.put).toHaveBeenCalledWith('/nodes/node-red/inject', {
          enabled: false,
        });
      });
    });

    describe('installNodeModule', () => {
      it('should install a module without version', async () => {
        mockAxiosInstance.post.mockResolvedValueOnce({ data: {} });

        await client.installNodeModule('node-red-contrib-test');

        expect(mockAxiosInstance.post).toHaveBeenCalledWith('/nodes', {
          module: 'node-red-contrib-test',
        });
      });

      it('should install a module with specific version', async () => {
        mockAxiosInstance.post.mockResolvedValueOnce({ data: {} });

        await client.installNodeModule('node-red-contrib-test', '1.0.0');

        expect(mockAxiosInstance.post).toHaveBeenCalledWith('/nodes', {
          module: 'node-red-contrib-test@1.0.0',
        });
      });
    });

    describe('uninstallNodeModule', () => {
      it('should uninstall a module', async () => {
        mockAxiosInstance.delete.mockResolvedValueOnce({ data: {} });

        await client.uninstallNodeModule('node-red-contrib-test');

        expect(mockAxiosInstance.delete).toHaveBeenCalledWith('/nodes/node-red-contrib-test');
      });
    });
  });

  describe('Module Management', () => {
    describe('searchModules', () => {
      it('should search npm registry for modules', async () => {
        (axios.get as Mock).mockResolvedValueOnce({ data: mockNpmSearchResponse });

        const result = await client.searchModules('test');

        expect(result).toBeDefined();
        expect(result.modules).toBeDefined();
        expect(Array.isArray(result.modules)).toBe(true);
        expect(axios.get).toHaveBeenCalledWith(
          'https://registry.npmjs.org/-/v1/search',
          expect.objectContaining({
            params: expect.objectContaining({
              text: 'node-red test',
            }),
          })
        );
      });

      it('should filter by contrib category', async () => {
        (axios.get as Mock).mockResolvedValueOnce({ data: mockNpmSearchResponse });

        await client.searchModules('test', 'contrib');

        expect(axios.get).toHaveBeenCalledWith(
          'https://registry.npmjs.org/-/v1/search',
          expect.objectContaining({
            params: expect.objectContaining({
              text: 'node-red-contrib test',
            }),
          })
        );
      });

      it('should filter by dashboard category', async () => {
        (axios.get as Mock).mockResolvedValueOnce({ data: mockNpmSearchResponse });

        await client.searchModules('test', 'dashboard');

        expect(axios.get).toHaveBeenCalledWith(
          'https://registry.npmjs.org/-/v1/search',
          expect.objectContaining({
            params: expect.objectContaining({
              text: 'node-red-dashboard test',
            }),
          })
        );
      });

      it('should respect limit parameter', async () => {
        (axios.get as Mock).mockResolvedValueOnce({ data: mockNpmSearchResponse });

        await client.searchModules('test', 'all', 5);

        expect(axios.get).toHaveBeenCalledWith(
          'https://registry.npmjs.org/-/v1/search',
          expect.objectContaining({
            params: expect.objectContaining({
              size: 5,
            }),
          })
        );
      });
    });

    describe('installModule', () => {
      it('should install a module successfully', async () => {
        mockAxiosInstance.post.mockResolvedValueOnce({ data: {} });

        const result = await client.installModule('node-red-contrib-test');

        expect(result.success).toBe(true);
        expect(result.module).toBe('node-red-contrib-test');
        expect(result.message).toContain('installed successfully');
      });

      it('should install a module with version', async () => {
        mockAxiosInstance.post.mockResolvedValueOnce({ data: {} });

        const result = await client.installModule('node-red-contrib-test', '1.0.0');

        expect(result.success).toBe(true);
        expect(result.version).toBe('1.0.0');
      });

      it('should handle installation failure', async () => {
        mockAxiosInstance.post.mockRejectedValueOnce(new Error('Module not found'));

        const result = await client.installModule('nonexistent-module');

        expect(result.success).toBe(false);
        expect(result.message).toContain('Failed to install');
      });
    });

    describe('getInstalledModules', () => {
      it('should return installed modules', async () => {
        mockAxiosInstance.get.mockResolvedValueOnce({
          data: [
            { module: 'node-red-contrib-mqtt', version: '1.2.0', name: 'mqtt' },
            { module: 'node-red-dashboard', version: '3.6.0', name: 'dashboard' },
            { module: 'node-red', version: '3.1.0', name: 'inject' }, // Should be filtered out
          ],
        });

        const modules = await client.getInstalledModules();

        expect(modules).toBeDefined();
        expect(Array.isArray(modules)).toBe(true);
        // Should not include core 'node-red' module
        expect(modules.find(m => m.name === 'node-red')).toBeUndefined();
      });
    });
  });

  describe('Runtime Information', () => {
    describe('getSettings', () => {
      it('should return runtime settings', async () => {
        mockAxiosInstance.get.mockResolvedValueOnce({ data: mockSettings });

        const settings = await client.getSettings();

        expect(settings).toEqual(mockSettings);
        expect(mockAxiosInstance.get).toHaveBeenCalledWith('/settings');
      });
    });

    describe('getRuntimeInfo', () => {
      it('should return runtime info', async () => {
        mockAxiosInstance.get.mockResolvedValueOnce({ data: mockRuntimeInfo });

        const info = await client.getRuntimeInfo();

        expect(info).toEqual(mockRuntimeInfo);
        expect(mockAxiosInstance.get).toHaveBeenCalledWith('/admin/info');
      });
    });

    describe('getFlowStatus', () => {
      it('should return flow status', async () => {
        mockAxiosInstance.get.mockResolvedValueOnce({ data: mockFlowStatus });

        const status = await client.getFlowStatus();

        expect(status).toEqual(mockFlowStatus);
        expect(mockAxiosInstance.get).toHaveBeenCalledWith('/flows/state');
      });
    });

    describe('startFlows', () => {
      it('should start all flows', async () => {
        mockAxiosInstance.post.mockResolvedValueOnce({ data: {} });

        await client.startFlows();

        expect(mockAxiosInstance.post).toHaveBeenCalledWith('/flows/state', { state: 'start' });
      });
    });

    describe('stopFlows', () => {
      it('should stop all flows', async () => {
        mockAxiosInstance.post.mockResolvedValueOnce({ data: {} });

        await client.stopFlows();

        expect(mockAxiosInstance.post).toHaveBeenCalledWith('/flows/state', { state: 'stop' });
      });
    });

    describe('getVersion', () => {
      it('should return Node-RED version', async () => {
        mockAxiosInstance.get.mockResolvedValueOnce({ data: mockRuntimeInfo });

        const version = await client.getVersion();

        expect(version).toBe('3.1.0');
      });
    });
  });

  describe('Context Management', () => {
    describe('getGlobalContext', () => {
      it('should get all global context', async () => {
        mockAxiosInstance.get.mockResolvedValueOnce({ data: mockGlobalContext });

        const context = await client.getGlobalContext();

        expect(context).toEqual(mockGlobalContext);
        expect(mockAxiosInstance.get).toHaveBeenCalledWith('/context/global');
      });

      it('should get specific global context key', async () => {
        mockAxiosInstance.get.mockResolvedValueOnce({ data: { counter: 42 } });

        const context = await client.getGlobalContext('counter');

        expect(context).toEqual({ counter: 42 });
        expect(mockAxiosInstance.get).toHaveBeenCalledWith('/context/global/counter');
      });
    });

    describe('setGlobalContext', () => {
      it('should set global context value', async () => {
        mockAxiosInstance.put.mockResolvedValueOnce({ data: {} });

        await client.setGlobalContext('newKey', 'newValue');

        expect(mockAxiosInstance.put).toHaveBeenCalledWith('/context/global/newKey', {
          value: 'newValue',
        });
      });
    });

    describe('deleteGlobalContext', () => {
      it('should delete global context key', async () => {
        mockAxiosInstance.delete.mockResolvedValueOnce({ data: {} });

        await client.deleteGlobalContext('counter');

        expect(mockAxiosInstance.delete).toHaveBeenCalledWith('/context/global/counter');
      });
    });

    describe('getFlowContext', () => {
      it('should get flow context', async () => {
        mockAxiosInstance.get.mockResolvedValueOnce({ data: { flowVar: 'value' } });

        const context = await client.getFlowContext('flow-1');

        expect(context).toEqual({ flowVar: 'value' });
        expect(mockAxiosInstance.get).toHaveBeenCalledWith('/context/flow/flow-1');
      });

      it('should get specific flow context key', async () => {
        mockAxiosInstance.get.mockResolvedValueOnce({ data: { flowVar: 'value' } });

        const context = await client.getFlowContext('flow-1', 'flowVar');

        expect(mockAxiosInstance.get).toHaveBeenCalledWith('/context/flow/flow-1/flowVar');
      });
    });

    describe('setFlowContext', () => {
      it('should set flow context value', async () => {
        mockAxiosInstance.put.mockResolvedValueOnce({ data: {} });

        await client.setFlowContext('flow-1', 'flowVar', 'newValue');

        expect(mockAxiosInstance.put).toHaveBeenCalledWith('/context/flow/flow-1/flowVar', {
          value: 'newValue',
        });
      });
    });
  });

  describe('Library Management', () => {
    describe('getLibraryEntries', () => {
      it('should get library entries with default type', async () => {
        mockAxiosInstance.get.mockResolvedValueOnce({ data: mockLibraryEntries });

        const entries = await client.getLibraryEntries();

        expect(entries).toEqual(mockLibraryEntries);
        expect(mockAxiosInstance.get).toHaveBeenCalledWith('/library/flows');
      });

      it('should get library entries with custom type', async () => {
        mockAxiosInstance.get.mockResolvedValueOnce({ data: mockLibraryEntries });

        const entries = await client.getLibraryEntries('functions');

        expect(mockAxiosInstance.get).toHaveBeenCalledWith('/library/functions');
      });
    });

    describe('saveToLibrary', () => {
      it('should save to library', async () => {
        mockAxiosInstance.post.mockResolvedValueOnce({ data: {} });

        await client.saveToLibrary('flows', 'myflow', { id: 'flow-1' });

        expect(mockAxiosInstance.post).toHaveBeenCalledWith('/library/flows/myflow', {
          id: 'flow-1',
        });
      });
    });

    describe('loadFromLibrary', () => {
      it('should load from library', async () => {
        mockAxiosInstance.get.mockResolvedValueOnce({ data: mockFlowTab });

        const data = await client.loadFromLibrary('flows', 'myflow');

        expect(data).toEqual(mockFlowTab);
        expect(mockAxiosInstance.get).toHaveBeenCalledWith('/library/flows/myflow');
      });
    });
  });

  describe('Authentication', () => {
    describe('login', () => {
      it('should login successfully', async () => {
        mockAxiosInstance.post.mockResolvedValueOnce({ data: mockAuthToken });

        const result = await client.login('admin', 'password');

        expect(result).toEqual(mockAuthToken);
        expect(mockAxiosInstance.post).toHaveBeenCalledWith('/auth/token', {
          client_id: 'node-red-admin',
          grant_type: 'password',
          scope: '*',
          username: 'admin',
          password: 'password',
        });
      });
    });

    describe('refreshToken', () => {
      it('should refresh token', async () => {
        mockAxiosInstance.post.mockResolvedValueOnce({ data: mockAuthToken });

        const result = await client.refreshToken('refresh-token');

        expect(result).toEqual(mockAuthToken);
        expect(mockAxiosInstance.post).toHaveBeenCalledWith('/auth/token', {
          client_id: 'node-red-admin',
          grant_type: 'refresh_token',
          refresh_token: 'refresh-token',
        });
      });
    });

    describe('getAuthStatus', () => {
      it('should get auth status', async () => {
        mockAxiosInstance.get.mockResolvedValueOnce({ data: mockAuthStatus });

        const status = await client.getAuthStatus();

        expect(status).toEqual(mockAuthStatus);
        expect(mockAxiosInstance.get).toHaveBeenCalledWith('/auth/login');
      });
    });
  });

  describe('Health Check', () => {
    it('should return healthy status when all checks pass', async () => {
      mockAxiosInstance.get
        .mockResolvedValueOnce({ data: mockSettings })
        .mockResolvedValueOnce({ data: mockFlows })
        .mockResolvedValueOnce({ data: mockRuntimeInfo });

      const health = await client.healthCheck();

      expect(health.healthy).toBe(true);
      expect(health.details).toHaveProperty('version');
      expect(health.details).toHaveProperty('flowCount');
    });

    it('should return unhealthy status on error', async () => {
      mockAxiosInstance.get.mockRejectedValueOnce(new Error('Connection failed'));

      const health = await client.healthCheck();

      expect(health.healthy).toBe(false);
      expect(health.details).toHaveProperty('error');
    });
  });

  describe('Circuit Breaker', () => {
    it('should return circuit breaker stats', () => {
      const stats = client.getCircuitBreakerStats();

      expect(stats).toHaveProperty('state');
      expect(stats).toHaveProperty('failureCount');
      expect(stats).toHaveProperty('successCount');
    });

    it('should reset circuit breaker', () => {
      client.resetCircuitBreaker();

      const stats = client.getCircuitBreakerStats();
      expect(stats.failureCount).toBe(0);
      expect(stats.state).toBe('closed');
    });
  });

  describe('JSON Response Validation', () => {
    it('should throw error when response data is HTML string with Node-RED content', async () => {
      // getFlows has additional validation that checks if response data looks like HTML
      mockAxiosInstance.get.mockResolvedValueOnce({
        data: 'Node-RED dashboard login page content',
        headers: { 'content-type': 'application/json' },
      });

      await expect(client.getFlows()).rejects.toThrow(/HTML content instead of flow data/);
    });

    it('should throw error when response data contains Node-RED HTML', async () => {
      // The validation specifically looks for 'Node-RED' string in the response
      mockAxiosInstance.get.mockResolvedValueOnce({
        data: '<!DOCTYPE html><html><title>Node-RED</title><body>Login</body></html>',
        headers: { 'content-type': 'application/json' },
      });

      await expect(client.getFlows()).rejects.toThrow(/HTML content instead of flow data/);
    });

    it('should accept valid array response', async () => {
      mockAxiosInstance.get.mockResolvedValueOnce({
        data: mockFlows,
        headers: { 'content-type': 'application/json' },
      });

      const flows = await client.getFlows();
      expect(Array.isArray(flows)).toBe(true);
    });
  });
});
