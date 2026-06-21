import { describe, it, expect, vi } from 'vitest';

import {
  BM25Provider,
  ExternalApiProvider,
  createEmbeddingProvider,
  type IndexedDocument,
} from './embedding-provider.js';

const docs: IndexedDocument[] = [
  { id: 'a', text: 'mqtt temperature sensor publish', metadata: { type: 'mqtt' } },
  { id: 'b', text: 'http request api endpoint get', metadata: { type: 'http' } },
  { id: 'c', text: 'function node javascript transform', metadata: { type: 'function' } },
  { id: 'd', text: 'mqtt subscribe topic broker', metadata: { type: 'mqtt' } },
];

describe('BM25Provider', () => {
  const provider = new BM25Provider();

  it('returns empty array for empty query', async () => {
    const results = await provider.search('', docs, 5);
    expect(results).toEqual([]);
  });

  it('returns empty array for empty document list', async () => {
    const results = await provider.search('mqtt', [], 5);
    expect(results).toEqual([]);
  });

  it('returns relevant results sorted by score desc', async () => {
    const results = await provider.search('mqtt sensor', docs, 10);
    expect(results.length).toBeGreaterThan(0);
    // mqtt-related docs should rank higher
    const ids = results.map(r => r.id);
    expect(ids[0]).toMatch(/^[ad]$/); // 'a' or 'd' should be first
  });

  it('normalizes scores to [0, 1]', async () => {
    const results = await provider.search('mqtt', docs, 10);
    for (const r of results) {
      expect(r.score).toBeGreaterThan(0);
      expect(r.score).toBeLessThanOrEqual(1);
    }
  });

  it('respects topK limit', async () => {
    const results = await provider.search('mqtt', docs, 1);
    expect(results.length).toBeLessThanOrEqual(1);
  });

  it('returns zero results when no terms match', async () => {
    const results = await provider.search('zxqwerty', docs, 10);
    expect(results).toEqual([]);
  });

  it('includes id and metadata in results', async () => {
    const results = await provider.search('http api', docs, 5);
    expect(results.length).toBeGreaterThan(0);
    const httpResult = results.find(r => r.id === 'b');
    expect(httpResult).toBeDefined();
    expect(httpResult?.metadata.type).toBe('http');
  });
});

describe('ExternalApiProvider', () => {
  it('returns empty array when documents list is empty', async () => {
    const provider = new ExternalApiProvider('http://fake-api');
    const results = await provider.search('query', [], 5);
    expect(results).toEqual([]);
  });

  it('calls the embeddings endpoint with correct payload', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: [
          { embedding: [1, 0] }, // query
          { embedding: [1, 0] }, // doc a — cosine 1.0
          { embedding: [0, 1] }, // doc b — cosine 0.0
        ],
      }),
    } as any);

    const provider = new ExternalApiProvider('http://fake-api', 'text-embed-3-small');
    const results = await provider.search(
      'hello',
      [
        { id: 'a', text: 'hello world', metadata: {} },
        { id: 'b', text: 'goodbye world', metadata: {} },
      ],
      5
    );

    expect(fetchSpy).toHaveBeenCalledWith(
      'http://fake-api/embeddings',
      expect.objectContaining({
        method: 'POST',
      })
    );
    expect(results[0]!.id).toBe('a');
    expect(results[0]!.score).toBeCloseTo(1.0);

    fetchSpy.mockRestore();
  });

  it('throws when the API returns a non-ok response', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
    } as any);

    const provider = new ExternalApiProvider('http://fake-api');
    await expect(
      provider.search('query', [{ id: 'a', text: 'hello', metadata: {} }], 5)
    ).rejects.toThrow('Embedding API error: 401 Unauthorized');
  });
});

describe('createEmbeddingProvider', () => {
  it('returns BM25Provider when no config given', () => {
    const provider = createEmbeddingProvider();
    expect(provider).toBeInstanceOf(BM25Provider);
  });

  it('returns BM25Provider when embeddingApiUrl is absent', () => {
    const provider = createEmbeddingProvider({ embeddingModel: 'text-embed' });
    expect(provider).toBeInstanceOf(BM25Provider);
  });

  it('returns ExternalApiProvider when embeddingApiUrl is present', () => {
    const provider = createEmbeddingProvider({ embeddingApiUrl: 'http://api' });
    expect(provider).toBeInstanceOf(ExternalApiProvider);
  });
});
