import WebSocket from 'ws';

import { getNodeRedAuthHeader, getTlsRejectUnauthorized } from '../utils/auth.js';
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

function collectStatuses(
  wsUrl: string,
  timeoutMs: number
): Promise<{ statuses: Map<string, RawStatus>; connected: boolean }> {
  return new Promise((resolve, reject) => {
    const statuses = new Map<string, RawStatus>();
    let ws: WebSocket | null = null;
    let settled = false;
    let connected = false;

    const finish = (err?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      ws?.terminate();
      if (err) reject(err);
      else resolve({ statuses, connected });
    };

    const timer = setTimeout(finish, timeoutMs);

    try {
      ws = new WebSocket(wsUrl, {
        rejectUnauthorized: getTlsRejectUnauthorized(),
        headers: getNodeRedAuthHeader(),
      });
    } catch (err) {
      clearTimeout(timer);
      reject(err);
      return;
    }

    ws.on('open', () => {
      connected = true;
    });

    ws.on('message', (raw: WebSocket.RawData) => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-base-to-string
        const msg = JSON.parse(raw.toString()) as { topic: string; data?: any };

        if (msg.topic === 'auth') {
          if (msg.data === 'fail') {
            finish(new AuthenticationError('Node-RED WebSocket auth failed'));
          }
          return;
        }

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

    const [{ statuses, connected }, flows] = await Promise.all([
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
      statusesMayBeIncomplete: !connected,
    };
  }
}
