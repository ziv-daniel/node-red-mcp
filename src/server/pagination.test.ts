import { describe, it, expect } from 'vitest';

import {
  DEFAULT_LIMIT,
  MAX_LIMIT,
  applyPagination,
  isPaginated,
  parsePagination,
  stableSortBy,
} from './pagination.js';

describe('pagination helpers', () => {
  describe('isPaginated', () => {
    it('returns false for null/undefined args', () => {
      expect(isPaginated(undefined)).toBe(false);
      expect(isPaginated(null)).toBe(false);
    });

    it('returns false when neither limit nor offset is provided', () => {
      expect(isPaginated({})).toBe(false);
      expect(isPaginated({ query: 'foo' })).toBe(false);
    });

    it('returns true when limit is provided', () => {
      expect(isPaginated({ limit: 10 })).toBe(true);
    });

    it('returns true when offset is provided', () => {
      expect(isPaginated({ offset: 0 })).toBe(true);
    });

    it('returns true when both are provided', () => {
      expect(isPaginated({ limit: 10, offset: 5 })).toBe(true);
    });
  });

  describe('parsePagination', () => {
    it('applies defaults when nothing is provided', () => {
      expect(parsePagination(undefined)).toEqual({ limit: DEFAULT_LIMIT, offset: 0 });
      expect(parsePagination({})).toEqual({ limit: DEFAULT_LIMIT, offset: 0 });
    });

    it('uses provided limit and offset', () => {
      expect(parsePagination({ limit: 25, offset: 75 })).toEqual({ limit: 25, offset: 75 });
    });

    it('throws when limit is non-integer, < 1, or > MAX_LIMIT', () => {
      expect(() => parsePagination({ limit: 0 })).toThrow(/Invalid limit/);
      expect(() => parsePagination({ limit: -1 })).toThrow(/Invalid limit/);
      expect(() => parsePagination({ limit: 1.5 })).toThrow(/Invalid limit/);
      expect(() => parsePagination({ limit: MAX_LIMIT + 1 })).toThrow(/Invalid limit/);
    });

    it('throws when offset is non-integer or negative', () => {
      expect(() => parsePagination({ offset: -1 })).toThrow(/Invalid offset/);
      expect(() => parsePagination({ offset: 1.5 })).toThrow(/Invalid offset/);
    });

    it('accepts boundary values', () => {
      expect(parsePagination({ limit: 1 })).toEqual({ limit: 1, offset: 0 });
      expect(parsePagination({ limit: MAX_LIMIT })).toEqual({ limit: MAX_LIMIT, offset: 0 });
      expect(parsePagination({ offset: 0 })).toEqual({ limit: DEFAULT_LIMIT, offset: 0 });
    });
  });

  describe('applyPagination', () => {
    const items = Array.from({ length: 12 }, (_, i) => ({ id: `item-${i}` }));

    it('slices items per limit/offset and reports total', () => {
      const env = applyPagination(items, { limit: 5, offset: 0 });
      expect(env.items).toHaveLength(5);
      expect(env.items[0]).toEqual({ id: 'item-0' });
      expect(env.total).toBe(12);
      expect(env.limit).toBe(5);
      expect(env.offset).toBe(0);
      expect(env.hasMore).toBe(true);
    });

    it('sets hasMore false on the last page', () => {
      const env = applyPagination(items, { limit: 5, offset: 10 });
      expect(env.items).toHaveLength(2);
      expect(env.hasMore).toBe(false);
    });

    it('returns empty slice when offset is beyond end', () => {
      const env = applyPagination(items, { limit: 5, offset: 100 });
      expect(env.items).toEqual([]);
      expect(env.hasMore).toBe(false);
      expect(env.total).toBe(12);
    });

    it('uses defaults when args omit pagination fields', () => {
      const env = applyPagination(items, undefined);
      expect(env.limit).toBe(DEFAULT_LIMIT);
      expect(env.offset).toBe(0);
      expect(env.items).toHaveLength(12);
      expect(env.hasMore).toBe(false);
    });

    it('handles empty input', () => {
      const env = applyPagination<{ id: string }>([], { limit: 10 });
      expect(env).toEqual({ items: [], total: 0, limit: 10, offset: 0, hasMore: false });
    });

    it('propagates parsePagination errors', () => {
      expect(() => applyPagination(items, { limit: 0 })).toThrow(/Invalid limit/);
    });
  });

  describe('stableSortBy', () => {
    const data = [
      { id: 'c', score: 1 },
      { id: 'a', score: 2 },
      { id: 'b', score: 2 },
      { id: 'd', score: 0 },
    ];

    it('sorts ascending by key', () => {
      const out = stableSortBy(data, x => x.score, 'asc');
      expect(out.map(x => x.score)).toEqual([0, 1, 2, 2]);
    });

    it('sorts descending by key', () => {
      const out = stableSortBy(data, x => x.score, 'desc');
      expect(out.map(x => x.score)).toEqual([2, 2, 1, 0]);
    });

    it('falls back to id when primary key is equal', () => {
      const out = stableSortBy(data, x => x.score, 'asc');
      const equalGroup = out.filter(x => x.score === 2);
      expect(equalGroup.map(x => x.id)).toEqual(['a', 'b']);
    });

    it('pushes undefined keys to the end', () => {
      const mixed = [{ id: 'a', score: 5 }, { id: 'b' } as any, { id: 'c', score: 1 }];
      const out = stableSortBy(mixed, x => x.score, 'asc');
      expect(out.map(x => x.id)).toEqual(['c', 'a', 'b']);
    });

    it('does not mutate the input', () => {
      const original = [...data];
      stableSortBy(data, x => x.score, 'asc');
      expect(data).toEqual(original);
    });
  });
});
