/**
 * Mock API responses for tests
 */

import { NodeRedSettings, NodeRedRuntimeInfo, NodeRedNodeType } from '../../src/types/nodered.js';
import { NodeRedModule, ModuleSearchResult, ModuleInstallResult } from '../../src/services/nodered-api.js';

// Runtime and Settings
export const mockSettings: NodeRedSettings = {
  httpNodeRoot: '/api',
  httpAdminRoot: '/admin',
  adminAuth: {
    type: 'credentials',
    users: [{ username: 'admin', password: 'hashed', permissions: ['*'] }],
  },
  logging: {
    console: {
      level: 'info',
      metrics: true,
      audit: false,
    },
  },
};

export const mockRuntimeInfo: NodeRedRuntimeInfo = {
  version: '3.1.0',
  nodes: {
    'inject': { count: 5 },
    'debug': { count: 10 },
    'function': { count: 3 },
    'http in': { count: 2 },
    'http response': { count: 2 },
  },
  modules: {
    'node-red-contrib-mqtt': { version: '1.2.0' },
    'node-red-dashboard': { version: '3.6.0' },
  },
  memory: {
    rss: 100000000,
    heapTotal: 50000000,
    heapUsed: 30000000,
    external: 5000000,
  },
};

// Node Types
export const mockNodeTypes: NodeRedNodeType[] = [
  {
    id: 'node-red/inject',
    name: 'inject',
    module: 'node-red',
    version: '3.1.0',
    types: ['inject'],
    enabled: true,
    local: true,
  },
  {
    id: 'node-red/debug',
    name: 'debug',
    module: 'node-red',
    version: '3.1.0',
    types: ['debug'],
    enabled: true,
    local: true,
  },
  {
    id: 'node-red-contrib-mqtt/mqtt',
    name: 'mqtt',
    module: 'node-red-contrib-mqtt',
    version: '1.2.0',
    types: ['mqtt in', 'mqtt out', 'mqtt-broker'],
    enabled: true,
    local: false,
  },
];

// Module Management
export const mockInstalledModules: NodeRedModule[] = [
  {
    name: 'node-red-contrib-mqtt',
    version: '1.2.0',
    description: 'MQTT nodes for Node-RED',
  },
  {
    name: 'node-red-dashboard',
    version: '3.6.0',
    description: 'Dashboard nodes for Node-RED',
  },
  {
    name: 'node-red-contrib-influxdb',
    version: '0.7.0',
    description: 'InfluxDB nodes for Node-RED',
  },
];

export const mockSearchResult: ModuleSearchResult = {
  modules: [
    {
      name: 'node-red-contrib-influxdb',
      version: '0.7.0',
      description: 'A Node-RED node to save data to an InfluxDB database',
      author: 'node-red',
      keywords: ['node-red', 'influxdb', 'timeseries'],
      repository: 'https://github.com/node-red/node-red-contrib-influxdb',
      downloads: 0.95,
      updated: '2024-01-15T00:00:00Z',
    },
    {
      name: 'node-red-contrib-influxdb2',
      version: '1.0.0',
      description: 'InfluxDB 2.0 support for Node-RED',
      author: 'influx',
      keywords: ['node-red', 'influxdb', 'influxdb2'],
      repository: 'https://github.com/influx/node-red-contrib-influxdb2',
      downloads: 0.75,
      updated: '2024-02-20T00:00:00Z',
    },
  ],
  total: 2,
  query: 'node-red influxdb',
};

export const mockInstallSuccess: ModuleInstallResult = {
  success: true,
  module: 'node-red-contrib-test',
  version: '1.0.0',
  message: 'Module node-red-contrib-test@1.0.0 installed successfully',
};

export const mockInstallFailure: ModuleInstallResult = {
  success: false,
  module: 'node-red-contrib-nonexistent',
  version: undefined,
  message: 'Failed to install node-red-contrib-nonexistent: Module not found',
};

// Error responses
export const mockErrorResponses = {
  notFound: {
    status: 404,
    data: { error: 'not_found', message: 'Flow not found' },
    headers: { 'content-type': 'application/json' },
  },
  unauthorized: {
    status: 401,
    data: { error: 'unauthorized', message: 'Invalid credentials' },
    headers: { 'content-type': 'application/json' },
  },
  serverError: {
    status: 500,
    data: { error: 'internal_error', message: 'Internal server error' },
    headers: { 'content-type': 'application/json' },
  },
  htmlResponse: {
    status: 200,
    data: '<!DOCTYPE html><html><head><title>Node-RED</title></head><body>Node-RED Login</body></html>',
    headers: { 'content-type': 'text/html; charset=utf-8' },
  },
  rateLimited: {
    status: 429,
    data: { error: 'rate_limit', message: 'Too many requests' },
    headers: { 'content-type': 'application/json', 'retry-after': '60' },
  },
};

// npm registry mock response
export const mockNpmSearchResponse = {
  objects: [
    {
      package: {
        name: 'node-red-contrib-test',
        version: '1.0.0',
        description: 'Test module for Node-RED',
        keywords: ['node-red'],
        author: { name: 'Test Author' },
        publisher: { name: 'Test Publisher' },
        links: { repository: 'https://github.com/test/node-red-contrib-test' },
        date: '2024-01-01T00:00:00Z',
      },
      score: {
        detail: {
          popularity: 0.85,
        },
      },
    },
    {
      package: {
        name: 'node-red-contrib-another',
        version: '2.0.0',
        description: 'Another test module',
        keywords: ['node-red', 'another'],
        author: { name: 'Another Author' },
        links: {},
        date: '2024-02-01T00:00:00Z',
      },
      score: {
        detail: {
          popularity: 0.65,
        },
      },
    },
  ],
};

// Global context mock
export const mockGlobalContext = {
  someVariable: 'testValue',
  counter: 42,
  config: {
    enabled: true,
    threshold: 100,
  },
};

// Library entries mock
export const mockLibraryEntries = [
  { fn: 'flow1.json' },
  { fn: 'flow2.json' },
  { d: { 'subfolder': [{ fn: 'nested.json' }] } },
];

// Health check mock
export const mockHealthCheck = {
  healthy: true,
  details: {
    version: '3.1.0',
    flowCount: 5,
    nodeCount: 25,
    memory: {
      rss: 100000000,
      heapUsed: 30000000,
    },
  },
};

// Auth mock
export const mockAuthToken = {
  access_token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ0ZXN0IiwiaWF0IjoxNTE2MjM5MDIyfQ.test',
  token_type: 'Bearer',
  expires_in: 3600,
};

export const mockAuthStatus = {
  type: 'credentials',
  prompts: [
    { id: 'username', type: 'text', label: 'Username' },
    { id: 'password', type: 'password', label: 'Password' },
  ],
};
