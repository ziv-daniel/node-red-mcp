/**
 * Node-RED WebSocket Comms client
 * Connects to Node-RED's /comms endpoint for real-time push events.
 */

import WebSocket from 'ws';

import { SSEHandler } from '../server/sse-handler.js';
import {
  NodeRedFlowEvent,
  NodeRedNodeEvent,
  NodeRedRuntimeEvent,
  NodeRedStatusEvent,
} from '../types/nodered.js';
import {
  resolveNodeRedAuthHeader,
  resolveNodeRedAuthToken,
  getTlsRejectUnauthorized,
} from '../utils/auth.js';

export interface NodeRedWsConfig {
  baseURL: string;
  maxReconnectDelay?: number;
  onEvent?: () => void;
}

// Node-RED's own /comms wire format: the auth handshake reply is a flat
// { auth: 'ok' | 'fail' } object; every other frame is a { topic, data }
// event, and Node-RED batches multiple events into a JSON array per message
// (confirmed against a live instance — a single inject can produce a
// two-element array in one WebSocket message).
interface CommsMessage {
  topic?: string;
  data?: any;
  auth?: 'ok' | 'fail';
}

export class NodeRedWsClient {
  private ws: WebSocket | null = null;
  private sseHandler: SSEHandler;
  private baseURL: string;
  private maxReconnectDelay: number;
  private reconnectDelay = 1000;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private connected = false;
  private stopped = false;
  private onEvent?: () => void;
  // Set when Node-RED's in-band /comms handshake rejects our token, cleared
  // on a successful handshake — forces a fresh token on the next reconnect
  // instead of retrying with the same one forever.
  private authFailedLastAttempt = false;

  constructor(sseHandler: SSEHandler, config: NodeRedWsConfig) {
    this.sseHandler = sseHandler;
    this.baseURL = config.baseURL;
    this.maxReconnectDelay = config.maxReconnectDelay ?? 30000;
    if (config.onEvent !== undefined) this.onEvent = config.onEvent;
  }

  connect(): void {
    this.stopped = false;
    this.reconnectDelay = 1000;
    void this._connect();
  }

  private async _connect(): Promise<void> {
    if (this.stopped) return;

    if (this.ws) {
      this.ws.terminate();
      this.ws = null;
    }

    const wsUrl = `${this.baseURL
      .replace(/^https:\/\//, 'wss://')
      .replace(/^http:\/\//, 'ws://')
      .replace(/\/$/, '')}/comms`;

    let token: string | undefined;
    try {
      const forceRefresh = this.authFailedLastAttempt;
      const [headers, resolvedToken] = await Promise.all([
        resolveNodeRedAuthHeader(forceRefresh),
        resolveNodeRedAuthToken(forceRefresh),
      ]);
      token = resolvedToken;
      this.ws = new WebSocket(wsUrl, {
        rejectUnauthorized: getTlsRejectUnauthorized(),
        // Still sent even though Node-RED's own adminAuth ignores headers on
        // this endpoint — a reverse proxy in front of Node-RED may still
        // gate the WS upgrade request on it.
        headers,
      });
    } catch (err) {
      console.error('NodeRedWsClient: failed to create WebSocket', err);
      this._scheduleReconnect();
      return;
    }

    this.ws.on('open', () => {
      this.connected = true;
      this.reconnectDelay = 1000;
      console.log(`NodeRedWsClient: connected to ${wsUrl}`);
      // Node-RED's /comms auth is entirely in-band: the connection headers
      // above do nothing for Node-RED's own adminAuth. Per Node-RED's docs,
      // the client must send { auth: "<token>" } as its first message.
      if (token) {
        this.ws!.send(JSON.stringify({ auth: token }));
      }
    });

    this.ws.on('message', (raw: WebSocket.RawData) => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-base-to-string
        const parsed: unknown = JSON.parse(raw.toString());
        // Node-RED batches multiple events into a JSON array per WS message;
        // the auth handshake reply is always a single flat object.
        const frames: CommsMessage[] = Array.isArray(parsed) ? parsed : [parsed];
        for (const msg of frames) {
          this._handleMessage(msg);
        }
      } catch {
        // ignore malformed frames
      }
    });

    this.ws.on('close', () => {
      this.connected = false;
      if (!this.stopped) {
        console.log('NodeRedWsClient: disconnected, scheduling reconnect');
        this._scheduleReconnect();
      }
    });

    this.ws.on('error', err => {
      // 'close' fires after 'error', which will trigger reconnect
      console.error('NodeRedWsClient: error —', err.message);
    });
  }

  private _scheduleReconnect(): void {
    if (this.stopped) return;
    const delay = this.reconnectDelay;
    this.reconnectDelay = Math.min(this.reconnectDelay * 2, this.maxReconnectDelay);
    this.reconnectTimer = setTimeout(() => void this._connect(), delay);
  }

  private _handleMessage(msg: CommsMessage): void {
    this.onEvent?.();

    if (typeof msg.auth === 'string') {
      if (msg.auth === 'ok') {
        this.authFailedLastAttempt = false;
        console.log('NodeRedWsClient: auth ok');
      } else {
        this.authFailedLastAttempt = true;
        console.error('NodeRedWsClient: auth failed');
      }
      return;
    }

    if (typeof msg.topic !== 'string') return;
    const { topic, data } = msg;
    const timestamp = new Date().toISOString();

    if (topic.startsWith('status/')) {
      const nodeId = topic.slice('status/'.length);
      const event: NodeRedStatusEvent = {
        type: 'status',
        timestamp,
        data: {
          id: nodeId,
          status: {
            fill: data?.fill,
            shape: data?.shape,
            text: data?.text,
          },
        },
      };
      this.sseHandler.broadcast(event);
      return;
    }

    if (topic === 'debug') {
      const event: NodeRedNodeEvent = {
        type: 'node',
        timestamp,
        data: {
          id: data?.id ?? 'unknown',
          type: 'debug',
          event: 'output',
          msg: data,
        },
      };
      this.sseHandler.broadcast(event);
      return;
    }

    if (topic === 'notification/runtime-state') {
      const state: string = data?.state ?? 'unknown';
      const event: NodeRedRuntimeEvent = {
        type: 'runtime',
        timestamp,
        data: {
          event: state === 'stop' ? 'stop' : state === 'start' ? 'start' : 'restart',
          message: `Runtime state: ${state}`,
        },
      };
      this.sseHandler.broadcast(event);
      return;
    }

    if (topic.startsWith('notification/')) {
      const action = topic.replace('notification/', '');
      const event: NodeRedNodeEvent = {
        type: 'node',
        timestamp,
        data: {
          id: data?.id ?? 'unknown',
          type: data?.type ?? 'unknown',
          event: 'status',
          msg: { action, ...data },
        },
      };
      this.sseHandler.broadcast(event);
    }
  }

  disconnect(): void {
    this.stopped = true;
    this.connected = false;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.terminate();
      this.ws = null;
    }
  }

  isConnected(): boolean {
    return this.connected;
  }
}
