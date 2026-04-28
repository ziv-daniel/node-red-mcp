/**
 * Node-RED WebSocket Comms client
 * Connects to Node-RED's /comms endpoint for real-time push events.
 */

import https from 'https';

import axios from 'axios';
import WebSocket from 'ws';

import { SSEHandler } from '../server/sse-handler.js';
import {
  NodeRedFlowEvent,
  NodeRedNodeEvent,
  NodeRedRuntimeEvent,
  NodeRedStatusEvent,
} from '../types/nodered.js';
import { validateNodeRedAuth } from '../utils/auth.js';

export interface NodeRedWsConfig {
  baseURL: string;
  maxReconnectDelay?: number;
  onEvent?: () => void;
}

interface CommsMessage {
  topic: string;
  data?: any;
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
  private accessToken: string | null = null;

  private async fetchOAuthToken(): Promise<string | null> {
    const username = process.env.NODERED_USERNAME;
    const password = process.env.NODERED_PASSWORD;
    if (!username || !password) return null;
    try {
      const resp = await axios.post<{ access_token: string }>(
        `${this.baseURL}/auth/token`,
        { client_id: 'node-red-admin', grant_type: 'password', username, password },
        { httpsAgent: new https.Agent({ rejectUnauthorized: false }) }
      );
      return resp.data.access_token;
    } catch {
      return null;
    }
  }

  constructor(sseHandler: SSEHandler, config: NodeRedWsConfig) {
    this.sseHandler = sseHandler;
    this.baseURL = config.baseURL;
    this.maxReconnectDelay = config.maxReconnectDelay ?? 30000;
    if (config.onEvent !== undefined) this.onEvent = config.onEvent;
  }

  connect(): void {
    this.stopped = false;
    this.reconnectDelay = 1000;
    this._connect();
  }

  private _connect(): void {
    if (this.stopped) return;
    // Fetch OAuth token before connecting, then proceed
    void this._connectWithAuth();
  }

  private async _connectWithAuth(): Promise<void> {
    if (this.stopped) return;

    if (this.ws) {
      this.ws.terminate();
      this.ws = null;
    }

    // Obtain OAuth token for handshake (clears on 401 to force re-login)
    if (!this.accessToken) {
      this.accessToken = await this.fetchOAuthToken();
    }

    const wsUrl = `${this.baseURL
      .replace(/^https:\/\//, 'wss://')
      .replace(/^http:\/\//, 'ws://')
      .replace(/\/$/, '')}/comms`;

    const wsOpts: WebSocket.ClientOptions = { rejectUnauthorized: false };
    if (this.accessToken) {
      wsOpts.headers = { Authorization: `Bearer ${this.accessToken}` };
    }

    try {
      this.ws = new WebSocket(wsUrl, wsOpts);
    } catch (err) {
      console.error('NodeRedWsClient: failed to create WebSocket', err);
      this._scheduleReconnect();
      return;
    }

    this.ws.on('open', () => {
      this.connected = true;
      this.reconnectDelay = 1000;
      console.log(`NodeRedWsClient: connected to ${wsUrl}`);
      this._sendAuth();
    });

    this.ws.on('message', (raw: WebSocket.RawData) => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-base-to-string
        const msg: CommsMessage = JSON.parse(raw.toString());
        this._handleMessage(msg);
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
      // On 401, clear the cached token so reconnect will re-authenticate
      if (err.message.includes('401')) {
        this.accessToken = null;
      }
      console.error('NodeRedWsClient: error —', err.message);
    });
  }

  private _sendAuth(): void {
    const auth = validateNodeRedAuth();
    if (auth.type === 'bearer' && auth.credentials?.token) {
      this.ws!.send(JSON.stringify({ auth: auth.credentials.token }));
    }
    // basic auth has no WS equivalent — connect unauthenticated
  }

  private _scheduleReconnect(): void {
    if (this.stopped) return;
    const delay = this.reconnectDelay;
    this.reconnectDelay = Math.min(this.reconnectDelay * 2, this.maxReconnectDelay);
    this.reconnectTimer = setTimeout(() => this._connect(), delay);
  }

  private _handleMessage(msg: CommsMessage): void {
    this.onEvent?.();
    const { topic, data } = msg;
    const timestamp = new Date().toISOString();

    if (topic === 'auth') {
      if (data === 'ok') {
        console.log('NodeRedWsClient: auth ok');
      } else if (data === 'fail') {
        console.error('NodeRedWsClient: auth failed');
      }
      return;
    }

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
