/**
 * Pure helpers for the search UI (navbar dropdown and the /search page): turning the
 * `GET /search` payload into one ordered list of rows, where each row links, and splitting
 * text around the typed words so matches can be highlighted.
 */

export const GROUPS = ['folders', 'documents', 'items'];

/** `/search?q=...` — the full results page for a query. */
export function searchPagePath(q) {
  const query = (q || '').trim();
  return query ? `/search?q=${encodeURIComponent(query)}` : '/search';
}

/** Where a result opens. */
export function resultLink(row) {
  if (row.type === 'folder') return `/browse/${row.id}`;
  if (row.type === 'document') return `/documents/${row.id}`;
  return `/items/${row.id}`;
}

/**
 * Flattens `{folders, documents, items}` into rows in display order (Folders, Documents,
 * Passwords & notes), each `{ key, type, group, id, title, path, snippet, to, raw }`.
 */
export function flattenResults(data) {
  if (!data) return [];
  const rows = [];
  (data.folders || []).forEach((f) =>
    rows.push({ type: 'folder', group: 'folders', id: f.id, title: f.name, path: f.path || '', snippet: null, raw: f }),
  );
  (data.documents || []).forEach((d) =>
    rows.push({ type: 'document', group: 'documents', id: d.id, title: d.title, path: d.path || '', snippet: d.snippet || null, raw: d }),
  );
  (data.items || []).forEach((i) =>
    rows.push({ type: 'item', group: 'items', id: i.id, title: i.title, path: i.path || '', snippet: i.snippet || null, raw: i }),
  );
  return rows.map((row) => ({ ...row, key: `${row.type}-${row.id}`, to: resultLink(row) }));
}

/** Groups flattened rows back by group, keeping each row's position in the flat list. */
export function groupRows(rows) {
  const groups = {};
  rows.forEach((row, index) => {
    if (!groups[row.group]) groups[row.group] = [];
    groups[row.group].push({ row, index });
  });
  return GROUPS.filter((g) => groups[g]).map((g) => ({ group: g, entries: groups[g] }));
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Splits `text` into `[{ text, match }]` parts around every case-insensitive occurrence of
 * any word in `query` (words of at least one character).
 */
export function highlightParts(text, query) {
  const value = text == null ? '' : String(text);
  const words = String(query || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .sort((a, b) => b.length - a.length)
    .map(escapeRegExp);
  if (!value || words.length === 0) return [{ text: value, match: false }];
  const re = new RegExp(`(${words.join('|')})`, 'gi');
  return value
    .split(re)
    .filter((part) => part !== '')
    .map((part) => ({ text: part, match: words.some((w) => new RegExp(`^${w}$`, 'i').test(part)) }));
}
