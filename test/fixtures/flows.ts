/**
 * Mock flow data for tests
 */

import { NodeRedFlow, NodeRedFlowSummary, NodeRedFlowStatus } from '../../src/types/nodered.js';

export const mockFlowTab: NodeRedFlow = {
  id: 'flow-1',
  label: 'Test Flow',
  type: 'tab',
  disabled: false,
  info: 'A test flow for unit testing',
  nodes: [
    {
      id: 'node-1',
      type: 'inject',
      name: 'Trigger',
      x: 100,
      y: 100,
      wires: [['node-2']],
    },
    {
      id: 'node-2',
      type: 'debug',
      name: 'Debug Output',
      x: 300,
      y: 100,
      wires: [],
    },
  ],
};

export const mockFlowSubflow: NodeRedFlow = {
  id: 'subflow-1',
  label: 'Test Subflow',
  type: 'subflow',
  disabled: false,
  info: 'A reusable subflow',
  nodes: [
    {
      id: 'subflow-node-1',
      type: 'function',
      name: 'Process',
      x: 200,
      y: 150,
      wires: [],
    },
  ],
};

export const mockDisabledFlow: NodeRedFlow = {
  id: 'flow-disabled',
  label: 'Disabled Flow',
  type: 'tab',
  disabled: true,
  info: 'This flow is disabled',
  nodes: [],
};

export const mockFlowWithoutLabel: NodeRedFlow = {
  id: 'flow-no-label',
  type: 'tab',
  disabled: false,
  nodes: [
    {
      id: 'node-3',
      type: 'http in',
      name: '',
      x: 100,
      y: 100,
      wires: [['node-4']],
    },
  ],
};

export const mockConfigNode = {
  id: 'config-node-1',
  type: 'mqtt-broker',
  name: 'Local MQTT',
  broker: 'localhost',
  port: 1883,
};

export const mockFlows: NodeRedFlow[] = [
  mockFlowTab,
  mockFlowSubflow,
  mockDisabledFlow,
  mockFlowWithoutLabel,
];

export const mockFlowSummaries: NodeRedFlowSummary[] = [
  {
    id: 'flow-1',
    label: 'Test Flow',
    disabled: false,
    status: 'active',
    nodeCount: 2,
    info: 'A test flow for unit testing',
  },
  {
    id: 'subflow-1',
    label: 'Test Subflow',
    disabled: false,
    status: 'active',
    nodeCount: 1,
    info: 'A reusable subflow',
  },
  {
    id: 'flow-disabled',
    label: 'Disabled Flow',
    disabled: true,
    status: 'inactive',
    nodeCount: 0,
    info: 'This flow is disabled',
  },
];

export const mockFlowStatus: NodeRedFlowStatus = {
  state: 'start',
  flows: [
    { id: 'flow-1', type: 'tab', state: 'start' },
    { id: 'subflow-1', type: 'subflow', state: 'start' },
    { id: 'flow-disabled', type: 'tab', state: 'stop' },
  ],
};

export const mockCreatedFlow: NodeRedFlow = {
  id: 'new-flow-id',
  label: 'New Flow',
  type: 'tab',
  disabled: false,
  nodes: [],
};

export const mockComplexFlow: NodeRedFlow = {
  id: 'complex-flow',
  label: 'Complex Flow',
  type: 'tab',
  disabled: false,
  info: 'A complex flow with many nodes',
  nodes: [
    {
      id: 'node-http-in',
      type: 'http in',
      name: 'HTTP Endpoint',
      url: '/api/test',
      method: 'get',
      x: 100,
      y: 100,
      wires: [['node-function']],
    },
    {
      id: 'node-function',
      type: 'function',
      name: 'Process Request',
      func: 'msg.payload = { status: "ok" }; return msg;',
      x: 300,
      y: 100,
      wires: [['node-http-out']],
    },
    {
      id: 'node-http-out',
      type: 'http response',
      name: 'HTTP Response',
      x: 500,
      y: 100,
      wires: [],
    },
  ],
};
