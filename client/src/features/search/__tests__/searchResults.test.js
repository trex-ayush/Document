import { describe, expect, it } from 'vitest';
import { flattenResults, groupRows, highlightParts, resultLink, searchPagePath } from '../searchResults.js';

const payload = {
  folders: [{ id: 'f1', name: 'Papa', parentId: 's', path: 'Shared' }],
  documents: [{ id: 'd1', title: 'PAN card', folderId: 'f1', path: 'Shared › Papa', fileCount: 2, thumbnailUrl: null, snippet: null }],
  items: [
    { id: 'i1', kind: 'login', title: 'SBI netbanking', folderId: 's', path: 'Shared', snippet: 'user: papa@sbi' },
    { id: 'i2', kind: 'note', title: 'Locker', folderId: 's', path: 'Shared', snippet: null },
  ],
};

describe('flattenResults', () => {
  it('orders folders, then documents, then items, with links', () => {
    const rows = flattenResults(payload);
    expect(rows.map((r) => r.key)).toEqual(['folder-f1', 'document-d1', 'item-i1', 'item-i2']);
    expect(rows.map((r) => r.to)).toEqual(['/browse/f1', '/documents/d1', '/items/i1', '/items/i2']);
    expect(rows[0].title).toBe('Papa');
    expect(rows[2].snippet).toBe('user: papa@sbi');
  });

  it('copes with missing data and missing groups', () => {
    expect(flattenResults(undefined)).toEqual([]);
    expect(flattenResults({ documents: [{ id: 'x', title: 'X' }] })).toHaveLength(1);
  });
});

describe('groupRows', () => {
  it('keeps each row’s index in the flat list and skips empty groups', () => {
    const rows = flattenResults({ ...payload, documents: [] });
    const groups = groupRows(rows);
    expect(groups.map((g) => g.group)).toEqual(['folders', 'items']);
    expect(groups[1].entries.map((e) => e.index)).toEqual([1, 2]);
  });
});

describe('resultLink', () => {
  it('maps each type to its page', () => {
    expect(resultLink({ type: 'folder', id: 'a' })).toBe('/browse/a');
    expect(resultLink({ type: 'document', id: 'b' })).toBe('/documents/b');
    expect(resultLink({ type: 'item', id: 'c' })).toBe('/items/c');
  });
});

describe('highlightParts', () => {
  it('marks case-insensitive matches of every word', () => {
    expect(highlightParts('PAN card of Papa', 'pa')).toEqual([
      { text: 'PA', match: true },
      { text: 'N card of ', match: false },
      { text: 'Pa', match: true },
      { text: 'pa', match: true },
    ]);
    const parts = highlightParts('Aadhaar card', 'card aad');
    expect(parts.filter((p) => p.match).map((p) => p.text)).toEqual(['Aad', 'card']);
  });

  it('treats regex characters literally and handles empty input', () => {
    expect(highlightParts('a+b (c)', '(c)')).toEqual([
      { text: 'a+b ', match: false },
      { text: '(c)', match: true },
    ]);
    expect(highlightParts('', 'x')).toEqual([{ text: '', match: false }]);
    expect(highlightParts('abc', '  ')).toEqual([{ text: 'abc', match: false }]);
  });
});

describe('searchPagePath', () => {
  it('builds the /search link with an encoded query', () => {
    expect(searchPagePath('  pan card ')).toBe('/search?q=pan%20card');
    expect(searchPagePath('')).toBe('/search');
  });
});
