/**
 * Pure helpers behind `Pagination.jsx` and the pages that page a list on the client (no React,
 * so they're unit-tested in `__tests__/pagination.test.js`).
 */

/** Number of pages for `total` rows at `pageSize` per page (at least 1). */
export function pageCount(total, pageSize) {
  const size = Math.max(1, Number(pageSize) || 1);
  return Math.max(1, Math.ceil((Number(total) || 0) / size));
}

/** `page` kept inside 1…pageCount — e.g. after a filter shrinks the list. */
export function clampPage(page, total, pageSize) {
  const n = Math.floor(Number(page) || 1);
  return Math.min(Math.max(1, n), pageCount(total, pageSize));
}

/**
 * The page buttons to show, with '…' gaps — the starter's rule (apps/template Pagination.jsx):
 * every page when there are at most 5; otherwise the first, the last, and the current page with
 * one neighbour each side (widened to 4 at either end so the row keeps the same length).
 * pageNumbers(5, 12) -> [1, '…', 4, 5, 6, '…', 12]
 */
export function pageNumbers(current, totalPages) {
  const last = Math.max(1, Number(totalPages) || 1);
  const page = Math.min(Math.max(1, Number(current) || 1), last);
  if (last <= 5) return Array.from({ length: last }, (_, i) => i + 1);

  let start = Math.max(2, page - 1);
  let end = Math.min(last - 1, page + 1);
  if (page <= 3) end = 4;
  if (page >= last - 2) start = last - 3;

  const out = [1];
  if (start > 2) out.push('…');
  for (let i = start; i <= end; i += 1) out.push(i);
  if (end < last - 1) out.push('…');
  out.push(last);
  return out;
}

/** "Showing 26–50 of 120": the 1-based first and last row on `page`. */
export function pageRange(page, pageSize, total) {
  const n = Number(total) || 0;
  if (n === 0) return { from: 0, to: 0 };
  const size = Math.max(1, Number(pageSize) || 1);
  const p = clampPage(page, n, size);
  return { from: (p - 1) * size + 1, to: Math.min(p * size, n) };
}

/** The rows of `items` that belong on `page` (client-side paging). */
export function pageSlice(items, page, pageSize) {
  const list = items || [];
  const size = Math.max(1, Number(pageSize) || 1);
  const p = clampPage(page, list.length, size);
  return list.slice((p - 1) * size, p * size);
}
