export interface IndexedDocument {
  id: string;
  text: string;
  metadata: Record<string, unknown>;
}

export interface SearchResult {
  id: string;
  score: number;
  metadata: Record<string, unknown>;
}

export interface EmbeddingProvider {
  search(query: string, documents: IndexedDocument[], topK: number): Promise<SearchResult[]>;
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9_\-.]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length > 1);
}

const BM25_K1 = 1.5;
const BM25_B = 0.75;

export class BM25Provider implements EmbeddingProvider {
  async search(query: string, documents: IndexedDocument[], topK: number): Promise<SearchResult[]> {
    const queryTerms = tokenize(query);
    if (queryTerms.length === 0 || documents.length === 0) return [];

    const df = new Map<string, number>();
    const tokenizedDocs = documents.map(doc => {
      const tokens = tokenize(doc.text);
      for (const t of new Set(tokens)) df.set(t, (df.get(t) ?? 0) + 1);
      return { doc, tokens };
    });

    const N = documents.length;
    const avgDL = tokenizedDocs.reduce((sum, { tokens }) => sum + tokens.length, 0) / N;

    const raw = tokenizedDocs.map(({ doc, tokens }) => {
      const tf = new Map<string, number>();
      for (const t of tokens) tf.set(t, (tf.get(t) ?? 0) + 1);
      const dl = tokens.length;
      let score = 0;
      for (const term of queryTerms) {
        const dfVal = df.get(term) ?? 0;
        if (dfVal === 0) continue;
        const idf = Math.log((N - dfVal + 0.5) / (dfVal + 0.5) + 1);
        const tfVal = tf.get(term) ?? 0;
        const tfNorm =
          (tfVal * (BM25_K1 + 1)) / (tfVal + BM25_K1 * (1 - BM25_B + BM25_B * (dl / avgDL)));
        score += idf * tfNorm;
      }
      return { id: doc.id, score, metadata: doc.metadata };
    });

    const maxScore = Math.max(...raw.map(r => r.score));
    if (maxScore <= 0) return [];

    return raw
      .filter(r => r.score > 0)
      .map(r => ({ ...r, score: r.score / maxScore }))
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);
  }
}

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0,
    na = 0,
    nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i]! * b[i]!;
    na += a[i]! * a[i]!;
    nb += b[i]! * b[i]!;
  }
  return na === 0 || nb === 0 ? 0 : dot / (Math.sqrt(na) * Math.sqrt(nb));
}

export class ExternalApiProvider implements EmbeddingProvider {
  constructor(
    private readonly apiUrl: string,
    private readonly model?: string
  ) {}

  async search(query: string, documents: IndexedDocument[], topK: number): Promise<SearchResult[]> {
    if (documents.length === 0) return [];
    const texts = [query, ...documents.map(d => d.text)];
    const embeddings = await this.embed(texts);
    const queryVec = embeddings[0]!;
    const raw = documents.map((doc, i) => ({
      id: doc.id,
      score: cosineSimilarity(queryVec, embeddings[i + 1]!),
      metadata: doc.metadata,
    }));
    const maxScore = Math.max(...raw.map(r => r.score));
    if (maxScore <= 0) return [];
    return raw
      .filter(r => r.score > 0)
      .map(r => ({ ...r, score: r.score / maxScore }))
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);
  }

  private async embed(texts: string[]): Promise<number[][]> {
    const res = await fetch(`${this.apiUrl}/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ input: texts, model: this.model || undefined }),
    });
    if (!res.ok) throw new Error(`Embedding API error: ${res.status} ${res.statusText}`);
    const data = (await res.json()) as { data: { embedding: number[] }[] };
    return data.data.map(d => d.embedding);
  }
}

export function createEmbeddingProvider(config?: {
  embeddingApiUrl?: string;
  embeddingModel?: string;
}): EmbeddingProvider {
  if (config?.embeddingApiUrl)
    return new ExternalApiProvider(config.embeddingApiUrl, config.embeddingModel);
  return new BM25Provider();
}
