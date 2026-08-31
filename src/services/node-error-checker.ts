import WebSocket from 'ws';

import {
  resolveNodeRedAuthHeader,
  resolveNodeRedAuthToken,
  getTlsRejectUnauthorized,
} from '../utils/auth.js';
import { AuthenticationError } from '../utils/error-handling.js';

import { NodeRedAPIClient } from './nodered-api.js';

export interface NodeErrorEntry {
  nodeId: string;
  nodeType: string;
  label: string;
  status: { fill: string; shape?: string; text?: string };
  flowId: string;
  flowName: string;
}

export interface NodeErrorCheckResult {
  errors: NodeErrorEntry[];
  warnings: NodeErrorEntry[];
  statusesMayBeIncomplete: boolean;
}

interface RawStatus {
  fill?: string;
  shape?: string;
  text?: string;
}

interface CommsFrame {
  topic?: string;
  data?: any;
  auth?: 'ok' | 'fail';
}

async function collectStatuses(
  wsUrl: string,
  timeoutMs: number
): Promise<{
  statuses: Map<string, RawStatus>;
  connected: boolean;
  authExpected: boolean;
  authConfirmed: boolean;
}> {
  const [headers, token] = await Promise.all([
    resolveNodeRedAuthHeader(),
    resolveNodeRedAuthToken(),
  ]);
  const authExpected = token !== undefined;

  return new Promise((resolve, reject) => {
    const statuses = new Map<string, RawStatus>();
    let ws: WebSocket | null = null;
    let settled = false;
    let connected = false;
    let authConfirmed = false;

    const finish = (err?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      ws?.terminate();
      if (err) reject(err);
      else resolve({ statuses, connected, authExpected, authConfirmed });
    };

    const timer = setTimeout(finish, timeoutMs);

    try {
      ws = new WebSocket(wsUrl, {
        rejectUnauthorized: getTlsRejectUnauthorized(),
        // Still sent for a reverse proxy in front of Node-RED that gates the
        // WS upgrade on it — Node-RED's own adminAuth ignores it, see below.
        headers,
      });
    } catch (err) {
      clearTimeout(timer);
      reject(err);
      return;
    }

    ws.on('open', () => {
      connected = true;
      // Node-RED's /comms auth is entirely in-band, not header-based: send
      // { auth: "<token>" } as the first message per Node-RED's own docs.
      if (token) {
        ws.send(JSON.stringify({ auth: token }));
      }
    });

    ws.on('message', (raw: WebSocket.RawData) => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-base-to-string
        const parsed: unknown = JSON.parse(raw.toString());
        // Node-RED batches multiple events into a JSON array per WS message;
        // the auth handshake reply is always a single flat object.
        const frames: CommsFrame[] = Array.isArray(parsed) ? parsed : [parsed];

        for (const msg of frames) {
          if (typeof msg.auth === 'string') {
            // Trusting the WebSocket peer's own auth-handshake reply is
            // inherent to implementing Node-RED's documented /comms protocol
            // — there is no alternative, signed proof Node-RED provides. The
            // actual trust boundary is the TLS connection to NODERED_URL
            // (see getTlsRejectUnauthorized), not this in-band message; a
            // party able to inject frames on this socket without breaking
            // TLS has already compromised the channel this check depends on.
            // authConfirmed also only affects statusesMayBeIncomplete, a
            // diagnostic-completeness signal — it grants no access, since
            // the socket already receives whatever Node-RED sends regardless.
            if (msg.auth === 'ok') {
              // codeql[js/user-controlled-bypass] see comment above
              authConfirmed = true;
            } else {
              // Invalidate the cached token so the *next* check() call
              // re-exchanges instead of retrying with the same bad token.
              resolveNodeRedAuthToken(true).catch(() => {});
              finish(new AuthenticationError('Node-RED WebSocket auth failed'));
            }
            continue;
          }

          if (typeof msg.topic !== 'string') continue;
          // Any real event arriving is itself proof of authorization — an
          // unauthenticated /comms connection receives nothing at all
          // (confirmed empirically against a live instance). This covers
          // NODERED_API_TOKEN setups where Node-RED never bothers to send
          // an explicit { auth: "ok" } ack but still streams data.
          authConfirmed = true;

          if (msg.topic.startsWith('status/')) {
            const nodeId = msg.topic.slice('status/'.length);
            const d = (msg.data ?? {}) as Record<string, unknown>;
            const fill = typeof d.fill === 'string' ? d.fill : undefined;
            const shape = typeof d.shape === 'string' ? d.shape : undefined;
            const text = typeof d.text === 'string' ? d.text : undefined;
            if (!fill && !text) {
              statuses.delete(nodeId);
            } else {
              const s: RawStatus = {};
              if (fill !== undefined) s.fill = fill;
              if (shape !== undefined) s.shape = shape;
              if (text !== undefined) s.text = text;
              statuses.set(nodeId, s);
            }
          }
        }
      } catch {
        // ignore malformed frames
      }
    });

    ws.on('close', () => finish());
    ws.on('error', () => finish());
  });
}

export class NodeErrorChecker {
  constructor(private readonly apiClient: NodeRedAPIClient) {}

  async check(
    opts: {
      includeWarnings?: boolean;
      timeoutMs?: number;
    } = {}
  ): Promise<NodeErrorCheckResult> {
    const includeWarnings = opts.includeWarnings ?? false;
    const timeoutMs = Math.min(opts.timeoutMs ?? 2000, 30000);

    const [{ statuses, connected, authExpected, authConfirmed }, flows] = await Promise.all([
      collectStatuses(this.apiClient.getCommsWsUrl(), timeoutMs),
      this.apiClient.getFlows().catch((): Awaited<ReturnType<NodeRedAPIClient['getFlows']>> => []),
    ]);

    const nodeIndex = new Map<
      string,
      { nodeType: string; label: string; flowId: string; flowName: string }
    >();
    for (const flow of flows) {
      const flowName = flow.label ?? flow.id;
      for (const node of flow.nodes ?? []) {
        nodeIndex.set(node.id, {
          nodeType: node.type ?? 'unknown',
          label: node.name ?? '',
          flowId: flow.id,
          flowName,
        });
      }
    }

    const errors: NodeErrorEntry[] = [];
    const warnings: NodeErrorEntry[] = [];

    for (const [nodeId, rawStatus] of statuses) {
      const { fill, shape, text } = rawStatus;
      if (!fill) continue;
      const meta = nodeIndex.get(nodeId);
      const status: NodeErrorEntry['status'] = { fill };
      if (shape !== undefined) status.shape = shape;
      if (text !== undefined) status.text = text;
      const entry: NodeErrorEntry = {
        nodeId,
        nodeType: meta?.nodeType ?? 'unknown',
        label: meta?.label ?? '',
        status,
        flowId: meta?.flowId ?? '',
        flowName: meta?.flowName ?? '',
      };
      if (fill === 'red') {
        errors.push(entry);
      } else if (fill === 'yellow' && includeWarnings) {
        warnings.push(entry);
      }
    }

    return {
      errors,
      warnings,
      statusesMayBeIncomplete: !connected || (authExpected && !authConfirmed),
    };
  }
}
