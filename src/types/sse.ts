/**
 * Server-Sent Events (SSE) type definitions
 */

import { NodeRedEvent } from './nodered.js';

export interface SSEConnection {
  id: string;
  response: any; // Express Response object
  userId?: string;
  clientInfo: {
    userAgent?: string;
    ip?: string;
    connectedAt: Date;
    lastActivity: Date;
  };
  subscriptions: Set<string>; // Event types the client is subscribed to
  heartbeatInterval?: NodeJS.Timeout;
  isAlive: boolean;
}

export interface SSEMessage {
  id?: string;
  event?: string;
  data: string;
  retry?: number;
}

export interface SSEConfig {
  heartbeatInterval: number; // milliseconds
  maxConnections: number;
  retryTimeout: number; // milliseconds
  compression: boolean;
  cors: {
    origin: string | string[];
    credentials: boolean;
  };
}

export interface SSEEventFilter {
  eventTypes?: string[];
  nodeIds?: string[];
  flowIds?: string[];
  userId?: string;
}

export interface SSEStats {
  totalConnections: number;
  activeConnections: number;
  messagesSent: number;
  errors: number;
  uptime: number;
  connectionsByEventType: Record<string, number>;
}

export interface SSESubscription {
  connectionId: string;
  eventType: string;
  filter?: SSEEventFilter;
  subscribedAt: Date;
}

export type SSEEventType = 
  | 'node-event'
  | 'flow-event' 
  | 'runtime-event'
  | 'status-event'
  | 'error-event'
  | 'heartbeat'
  | 'system-info'
  | 'connection-status';

export interface SSEHeartbeat {
  type: 'heartbeat';
  timestamp: string;
  serverTime: number;
  connections: number;
}

export interface SSESystemInfo {
  type: 'system-info';
  timestamp: string;
  data: {
    memory: {
      used: number;
      total: number;
      percentage: number;
    };
    uptime: number;
    nodeRedStatus: 'connected' | 'disconnected' | 'error';
    activeFlows: number;
    totalNodes: number;
  };
}

export interface SSEConnectionStatus {
  type: 'connection-status';
  timestamp: string;
  data: {
    connectionId: string;
    status: 'connected' | 'disconnected' | 'error';
    clientCount: number;
  };
}

export interface SSEError {
  type: 'error';
  timestamp: string;
  data: {
    error: string;
    code?: string;
    source?: string;
    connectionId?: string;
  };
}

export type SSEEvent = 
  | NodeRedEvent 
  | SSEHeartbeat 
  | SSESystemInfo 
  | SSEConnectionStatus 
  | SSEError;

export interface SSEMiddlewareOptions {
  auth?: (req: any) => Promise<boolean> | boolean;
  rateLimit?: {
    windowMs: number;
    max: number;
  };
  compression?: boolean;
  headers?: Record<string, string>;
}

export interface SSEClientInfo {
  connectionId: string;
  userId?: string;
  connectedAt: Date;
  subscriptions: string[];
  messageCount: number;
  lastActivity: Date;
  isAlive: boolean;
} 