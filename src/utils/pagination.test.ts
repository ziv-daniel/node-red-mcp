import { describe, it, expect } from 'vitest';

import {
  applyPagination,
  decodeCursor,
  encodeCursor,
  paginationInputSchema,
} from './pagination.js';

describe('cursor encoding', () => {
  it('round-trips a positive offset', () => {
    expect(decodeCursor(encodeCursor(42))).toBe(42);
  });

  it('round-trips zero', () => {
    expect(decodeCursor(encodeCursor(0))).toBe(0);
  });

  it('decodes undefined to zero', () => {
    expect(decodeCursor(undefined)).toBe(0);
  });

  it('rejects a non-base64 string that decodes without the offset prefix', () => {
    const bogus = Buffer.from('hello').toString('base64');
    expect(() => decodeCursor(bogus)).toThrow(/Invalid cursor/);
  });

  it('rejects a cursor whose offset is not an integer', () => {
    const bogus = Buffer.from('offset:abc').toString('base64');
    expect(() => decodeCursor(bogus)).toThrow(/Invalid cursor/);
  });

  it('rejects a negative offset', () => {
    const bogus = Buffer.from('offset:-1').toString('base64');
    expect(() => decodeCursor(bogus)).toThrow(/Invalid cursor/);
  });
});

describe('paginationInputSchema', () => {
  it('accepts an empty object', () => {
    expect(paginationInputSchema.parse({})).toEqual({});
  });

  it('rejects limit below 1', () => {
    expect(() => paginationInputSchema.parse({ limit: 0 })).toThrow();
  });

  it('rejects limit above 200', () => {
    expect(() => paginationInputSchema.parse({ limit: 201 })).toThrow();
  });

  it('rejects non-integer limit', () => {
    expect(() => paginationInputSchema.parse({ limit: 1.5 })).toThrow();
  });
});

describe('applyPagination', () => {
  const items = Array.from({ length: 25 }, (_, i) => i);

  it('returns all items when no limit is provided', () => {
    const result = applyPagination(items, {});
    expect(result.items).toHaveLength(25);
    expect(result.pageInfo).toEqual({
      hasNextPage: false,
      nextCursor: null,
      totalCount: 25,
    });
  });

  it('slices the first page when limit is given', () => {
    const result = applyPagination(items, { limit: 10 });
    expect(result.items).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(result.pageInfo.hasNextPage).toBe(true);
    expect(result.pageInfo.totalCount).toBe(25);
    expect(result.pageInfo.nextCursor).not.toBeNull();
  });

  it('continues from a cursor on the next page', () => {
    const first = applyPagination(items, { limit: 10 });
    const second = applyPagination(items, { limit: 10, cursor: first.pageInfo.nextCursor! });
    expect(second.items).toEqual([10, 11, 12, 13, 14, 15, 16, 17, 18, 19]);
    expect(second.pageInfo.hasNextPage).toBe(true);
  });

  it('marks the final page', () => {
    const third = applyPagination(items, { limit: 10, cursor: encodeCursor(20) });
    expect(third.items).toEqual([20, 21, 22, 23, 24]);
    expect(third.pageInfo.hasNextPage).toBe(false);
    expect(third.pageInfo.nextCursor).toBeNull();
  });

  it('returns an empty page when offset is past the end', () => {
    const result = applyPagination(items, { limit: 10, cursor: encodeCursor(100) });
    expect(result.items).toEqual([]);
    expect(result.pageInfo).toEqual({
      hasNextPage: false,
      nextCursor: null,
      totalCount: 25,
    });
  });

  it('handles an empty input list', () => {
    const result = applyPagination<number>([], { limit: 10 });
    expect(result.items).toEqual([]);
    expect(result.pageInfo).toEqual({
      hasNextPage: false,
      nextCursor: null,
      totalCount: 0,
    });
  });
});
