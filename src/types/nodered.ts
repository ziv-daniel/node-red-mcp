/**
 * Node-RED type definitions for flows, nodes, and API responses
 */

export interface NodeRedFlow {
  id: string;
  type?: string;        // Type of flow: 'tab', 'subflow', or config node types
  label?: string;
  nodes: NodeRedNode[];
  configs?: NodeRedConfig[];
  subflows?: NodeRedSubflow[];
  disabled?: boolean;
  info?: string;
  env?: Array<{
    name: string;
    value: string;
    type: string;
  }>;
}

/**
 * Lightweight flow summary for efficient token usage
 * Only includes meaningful properties to reduce token consumption
 */
export interface NodeRedFlowSummary {
  id: string;
  label?: string;           // Only included if not empty
  disabled?: boolean;
  status?: 'active' | 'inactive' | 'error';
  nodeCount?: number;       // Only included if > 0
  info?: string;           // Only included if not empty
}

export interface NodeRedNode {
  id: string;
  type: string;
  z?: string; // flow id
  name?: string;
  x?: number;
  y?: number;
  wires?: string[][];
  info?: string;
  disabled?: boolean;
  [key: string]: any; // Additional node-specific properties
}

export interface NodeRedConfig {
  id: string;
  type: string;
  name?: string;
  [key: string]: any;
}

export interface NodeRedSubflow {
  id: string;
  name: string;
  info?: string;
  category?: string;
  in: Array<{
    x: number;
    y: number;
    wires: Array<{
      id: string;
    }>;
  }>;
  out: Array<{
    x: number;
    y: number;
    wires: Array<{
      id: string;
      port: number;
    }>;
  }>;
  env?: Array<{
    name: string;
    type: string;
    value?: string;
    ui?: {
      icon?: string;
      label?: {
        en: string;
      };
      type?: string;
    };
  }>;
}

export interface NodeRedNodeType {
  id: string;
  name: string;
  types: string[];
  enabled: boolean;
  local: boolean;
  module?: string;
  version?: string;
  loaded?: boolean;
  err?: string;
}

export interface NodeRedSettings {
  httpNodeRoot: string;
  httpAdminRoot: string;
  httpStatic?: string;
  httpStaticRoot?: string;
  uiHost?: string;
  uiPort?: number;
  mqttReconnectTime?: number;
  serialReconnectTime?: number;
  debugMaxLength?: number;
  functionGlobalContext?: Record<string, any>;
  exportGlobalContextKeys?: boolean;
  contextStorage?: Record<string, any>;
  adminAuth?: {
    type: string;
    users?: Array<{
      username: string;
      password: string;
      permissions: string[];
    }>;
  };
  logging?: {
    console?: {
      level: string;
      metrics?: boolean;
      audit?: boolean;
    };
  };
}

export interface NodeRedRuntimeInfo {
  version: string;
  git?: {
    total: number;
    count: number;
  };
  nodes: {
    [nodeType: string]: {
      count: number;
    };
  };
  modules: {
    [moduleName: string]: {
      version: string;
    };
  };
  memory: {
    rss: number;
    heapTotal: number;
    heapUsed: number;
    external: number;
  };
  flowFile?: string;
}

export interface NodeRedFlowStatus {
  state: 'start' | 'stop' | 'safe';
  flows: Array<{
    id: string;
    type: string;
    state?: 'start' | 'stop';
  }>;
}

export interface NodeRedDeploymentOptions {
  type: 'full' | 'nodes' | 'flows';
  nodes?: string[];
}

export interface NodeRedAPIError {
  error: string;
  message: string;
  code?: string;
  statusCode?: number;
}

// Event types for SSE
export interface NodeRedEvent {
  type: 'node' | 'flow' | 'runtime' | 'error' | 'status';
  timestamp: string;
  data: any;
}

export interface NodeRedNodeEvent extends NodeRedEvent {
  type: 'node';
  data: {
    id: string;
    type: string;
    event: 'input' | 'output' | 'error' | 'status';
    msg?: any;
    error?: string;
  };
}

export interface NodeRedFlowEvent extends NodeRedEvent {
  type: 'flow';
  data: {
    id: string;
    event: 'start' | 'stop' | 'deploy' | 'error';
    message?: string;
  };
}

export interface NodeRedRuntimeEvent extends NodeRedEvent {
  type: 'runtime';
  data: {
    event: 'start' | 'stop' | 'restart' | 'error';
    message?: string;
    memory?: {
      rss: number;
      heapTotal: number;
      heapUsed: number;
    };
  };
}

export interface NodeRedStatusEvent extends NodeRedEvent {
  type: 'status';
  data: {
    id: string;
    status: {
      fill?: 'red' | 'green' | 'yellow' | 'blue' | 'grey';
      shape?: 'ring' | 'dot';
      text?: string;
    };
  };
}

export interface NodeRedErrorEvent extends NodeRedEvent {
  type: 'error';
  data: {
    id?: string;
    type?: string;
    error: string;
    source?: {
      id: string;
      type: string;
      name?: string;
    };
  };
}