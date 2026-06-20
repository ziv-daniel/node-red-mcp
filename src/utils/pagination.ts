import { z } from 'zod';

const CURSOR_PREFIX = 'offset:';

export const paginationInputSchema = z.object({
  limit: z.number().int().min(1).max(200).optional(),
  cursor: z.string().optional(),
});

export type PaginationInput = z.infer<typeof paginationInputSchema>;

export interface PageInfo {
  hasNextPage: boolean;
  nextCursor: string | null;
  totalCount: number;
}

export interface PaginatedResult<T> {
  items: T[];
  pageInfo: PageInfo;
}

export function encodeCursor(offset: number): string {
  return Buffer.from(`${CURSOR_PREFIX}${offset}`).toString('base64');
}

export function decodeCursor(cursor: string | undefined): number {
  if (!cursor) return 0;
  const decoded = Buffer.from(cursor, 'base64').toString('utf8');
  if (!decoded.startsWith(CURSOR_PREFIX)) {
    throw new Error(`Invalid cursor: ${cursor}`);
  }
  const offset = Number(decoded.slice(CURSOR_PREFIX.length));
  if (!Number.isInteger(offset) || offset < 0) {
    throw new Error(`Invalid cursor: ${cursor}`);
  }
  return offset;
}

export function applyPagination<T>(items: T[], pagination: PaginationInput): PaginatedResult<T> {
  const totalCount = items.length;
  const offset = decodeCursor(pagination.cursor);
  const limit = pagination.limit ?? totalCount;
  const end = offset + limit;
  const sliced = items.slice(offset, end);
  const hasNextPage = end < totalCount;
  return {
    items: sliced,
    pageInfo: {
      hasNextPage,
      nextCursor: hasNextPage ? encodeCursor(end) : null,
      totalCount,
    },
  };
}
