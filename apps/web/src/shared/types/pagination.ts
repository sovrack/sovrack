/**
 * Unified pagination shape. Backends return divergent raw shapes
 * ({items,total,page,pageSize}, {data,total,page,limit,totalPages}, nested
 * {items,pagination:{...}}) — services normalize to this before returning
 * to components, which never touch limit/data/perPage/pagination.page
 * directly. See EXPLORATION_FRONTEND_FEATURES.md transversal check.
 */
export type PaginatedResponse<T> = {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

/** Raw shape shared by platform/audit-log and servers/servers.service —
 * {data, total, page, limit, totalPages}. */
export type RawDataPaginatedResponse<T> = {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
};

export function normalizeDataPagination<T>(
  raw: RawDataPaginatedResponse<T>,
): PaginatedResponse<T> {
  return {
    items: raw.data,
    page: raw.page,
    pageSize: raw.limit,
    total: raw.total,
    totalPages: raw.totalPages,
  };
}
