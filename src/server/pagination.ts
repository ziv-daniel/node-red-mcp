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
 * Stable sort: when the primary key compares equal, falls back to comparing
 * `id` so slice boundaries don't shuffle between requests.
 */
export function stableSortBy<T extends { id?: string }>(
  items: T[],
  keyFn: (item: T) => string | number | boolean | undefined,
  order: SortOrder = 'asc'
): T[] {
  const mul = order === 'asc' ? 1 : -1;
  return [...items].sort((a, b) => {
    const av = keyFn(a);
    const bv = keyFn(b);
    if (av === bv) {
      const aid = a.id ?? '';
      const bid = b.id ?? '';
      return aid < bid ? -1 : aid > bid ? 1 : 0;
    }
    if (av === undefined) return 1;
    if (bv === undefined) return -1;
    return av < bv ? -1 * mul : av > bv ? 1 * mul : 0;
  });
}
