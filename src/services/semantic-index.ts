import { EmbeddingProvider, IndexedDocument, SearchResult } from './embedding-provider.js';
import { NodeRedAPIClient } from './nodered-api.js';

const SKIP_NODE_KEYS = new Set([
  'id',
  'z',
  'x',
  'y',
  'wires',
  'inputLabels',
  'outputLabels',
  'icon',
  'links',
]);
const MAX_STRING_VALUE_LEN = 1000;
const DEFAULT_TTL_MS = 60_000;

export class SemanticFlowIndex {
  private documents: IndexedDocument[] = [];
  private lastIndexedAt = 0;

  constructor(
    private readonly client: NodeRedAPIClient,
    private readonly provider: EmbeddingProvider,
    private readonly ttlMs = DEFAULT_TTL_MS
  ) {}

  async search(
    query: string,
    topK = 10,
    scope: 'flows' | 'nodes' | 'all' = 'all'
  ): Promise<SearchResult[]> {
    await this.ensureIndexed();
    const docs =
      scope === 'all' ? this.documents : this.documents.filter(d => d.metadata.scope === scope);
    return this.provider.search(query, docs, topK);
  }

  async refresh(): Promise<void> {
    const flows = await this.client.getFlows();
    this.documents = this.buildDocuments(flows);
    this.lastIndexedAt = Date.now();
  }

  get documentCount(): number {
    return this.documents.length;
  }

  private async ensureIndexed(): Promise<void> {
    if (Date.now() - this.lastIndexedAt > this.ttlMs) await this.refresh();
  }

  private buildDocuments(flows: any[]): IndexedDocument[] {
    const docs: IndexedDocument[] = [];
    for (const flow of flows) {
      if (flow.type === 'tab' || flow.type === 'subflow') {
        docs.push({
          id: `flow:${flow.id}`,
          text: [flow.label, flow.type, flow.info].filter(Boolean).join(' '),
          metadata: {
            scope: 'flows',
            type: flow.type,
            id: flow.id,
            label: flow.label ?? '',
          },
        });
      }
      for (const node of flow.nodes ?? []) {
        const parts: string[] = [node.type, node.name, node.info].filter(Boolean);
        for (const [key, val] of Object.entries(node)) {
          if (SKIP_NODE_KEYS.has(key) || key === 'name' || key === 'info' || key === 'type')
            continue;
          if (typeof val === 'string' && val.length > 0 && val.length <= MAX_STRING_VALUE_LEN)
            parts.push(val);
        }
        docs.push({
          id: `node:${node.id}`,
          text: parts.join(' '),
          metadata: {
            scope: 'nodes',
            nodeId: node.id,
            nodeType: node.type,
            nodeName: node.name ?? '',
            flowId: flow.id,
            flowLabel: flow.label ?? '',
          },
        });
      }
    }
    return docs;
  }
}
