export const DEFAULT_LIMIT = 20;
export const MAX_LIMIT = 100;

/**
 * Normalises page/limit query params.
 * @param {{ page?: any, limit?: any }} query
 * @returns {{ page: number, limit: number, skip: number }}
 */
export function paginate(query = {}) {
  const pageNum = Number.parseInt(query.page, 10);
  const limitNum = Number.parseInt(query.limit, 10);
  const page = Number.isFinite(pageNum) && pageNum > 0 ? pageNum : 1;
  const limit = Number.isFinite(limitNum) && limitNum > 0 ? Math.min(limitNum, MAX_LIMIT) : DEFAULT_LIMIT;
  return { page, limit, skip: (page - 1) * limit };
}

/** Builds the standard list envelope. */
export function envelope(items, total, { page, limit }) {
  return { items, total, page, pages: Math.ceil(total / limit) };
}
