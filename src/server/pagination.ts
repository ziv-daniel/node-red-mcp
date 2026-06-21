/**
 * Offset-based pagination helpers for paginatable MCP tools.
 *
 * Contract:
 * - Envelope `{ items, total, limit, offset, hasMore }` is returned only when
 *   a pagination param (limit or offset) is provided. Otherwise the tool keeps
 *   its legacy response shape — see `isPaginated`.
 * - Invalid params throw → handled by the tool's catch → surfaced as an MCP
 *   error result, not a 500.
 * - Sorts are stabilised by a secondary key (id) so paginated slices are
 *   deterministic across requests.
 */

export const DEFAULT_LIMIT = 50;
export const MAX_LIMIT = 500;

export interface PaginationArgs {
  limit?: number;
  offset?: number;
}

export interface PaginationEnvelope<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

export type SortOrder = 'asc' | 'desc';

export function caseInsensitiveIncludes(value: unknown, needle: string): boolean {
  if (typeof value !== 'string') return false;
  return value.toLowerCase().includes(needle.toLowerCase());
}

export function parseSort<K extends string>(
  args: { sortBy?: unknown; order?: unknown } | undefined | null,
  allowedKeys: readonly K[]
): { sortBy: K | undefined; order: SortOrder } {
  const sortBy = args?.sortBy;
  const order = args?.order;
  if (sortBy !== undefined && !allowedKeys.includes(sortBy as K)) {
    throw new Error(`Invalid sortBy: must be one of ${allowedKeys.join(', ')}`);
  }
  if (order !== undefined && order !== 'asc' && order !== 'desc') {
    throw new Error('Invalid order: must be "asc" or "desc"');
  }
  return {
    sortBy: sortBy === undefined ? undefined : (sortBy as K),
    order: order === undefined ? 'asc' : order,
  };
}

export function isPaginated(args: Record<string, unknown> | undefined | null): boolean {
  if (!args) return false;
  return args.limit !== undefined || args.offset !== undefined;
}

export function parsePagination(args: PaginationArgs | undefined | null): {
  limit: number;
  offset: number;
} {
  const limit = args?.limit;
  const offset = args?.offset;

  if (limit !== undefined && (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT)) {
    throw new Error(`Invalid limit: must be an integer between 1 and ${MAX_LIMIT}`);
  }
  if (offset !== undefined && (!Number.isInteger(offset) || offset < 0)) {
    throw new Error('Invalid offset: must be a non-negative integer');
  }

  return {
    limit: limit ?? DEFAULT_LIMIT,
    offset: offset ?? 0,
  };
}

export function applyPagination<T>(
  items: T[],
  args: PaginationArgs | undefined | null
): PaginationEnvelope<T> {
  const { limit, offset } = parsePagination(args);
  const total = items.length;
  const slice = items.slice(offset, offset + limit);
  return {
    items: slice,
    total,
    limit,
    offset,
    hasMore: offset + slice.length < total,
  };
}

/**
 * Stable sort with id as secondary key. Uses a Schwartzian transform so
 * keyFn is invoked once per item rather than ~2·n·log n times during sort.
 */
export function stableSortBy<T extends { id?: string }>(
  items: T[],
  keyFn: (item: T) => string | number | boolean | undefined,
  order: SortOrder = 'asc'
): T[] {
  const mul = order === 'asc' ? 1 : -1;
  const tagged = items.map(item => ({ item, key: keyFn(item) }));
  tagged.sort((a, b) => {
    const ak = a.key;
    const bk = b.key;
    if (ak !== bk) {
      // Primary keys differ — undefined sorts last, otherwise compare.
      if (ak === undefined) return 1;
      if (bk === undefined) return -1;
      return (ak as any) < (bk as any) ? -mul : mul;
    }
    // Primary keys equal (or both undefined) — fall back to id for stability.
    const aid = a.item.id ?? '';
    const bid = b.item.id ?? '';
    return aid < bid ? -1 : aid > bid ? 1 : 0;
  });
  return tagged.map(t => t.item);
}
