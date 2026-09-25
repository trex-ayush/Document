import { describe, it, expect } from 'vitest';
import { buildBrowseEntries, buildFolderTree, folderName, sortFolders } from '../folderTreeUtils.js';

const shared = { id: 's', name: 'Shared', parentId: null, isSystem: true, systemKey: 'shared' };
const papa = { id: 'p', name: 'Papa', parentId: null, isSystem: false };
const aai = { id: 'a', name: 'aai', parentId: null, isSystem: false };
const rahul = { id: 'r', name: 'Rahul', parentId: 'p', isSystem: false };

describe('folder order', () => {
  it('puts the Shared folder first, then A to Z ignoring case', () => {
    expect(sortFolders([papa, shared, aai]).map((f) => f.id)).toEqual(['s', 'a', 'p']);
  });

  it('nests the tree with the same order', () => {
    const tree = buildFolderTree([rahul, papa, aai, shared]);
    expect(tree.map((f) => f.id)).toEqual(['s', 'a', 'p']);
    expect(tree[2].children.map((f) => f.id)).toEqual(['r']);
  });
});

describe('browse list', () => {
  it('lists subfolders first, then documents, passwords and notes newest first', () => {
    const entries = buildBrowseEntries({
      folders: [papa, shared],
      documents: [
        { id: 'd1', title: 'Old PAN', createdAt: '2026-01-01T00:00:00Z' },
        { id: 'd2', title: 'New Aadhaar', createdAt: '2026-03-01T00:00:00Z' },
      ],
      items: [
        { id: 'i1', kind: 'login', title: 'Bank', createdAt: '2026-02-01T00:00:00Z' },
        { id: 'i2', kind: 'note', title: 'Locker', createdAt: '2026-04-01T00:00:00Z' },
      ],
    });
    expect(entries.map((e) => e.key)).toEqual(['f-s', 'f-p', 'i-i2', 'd-d2', 'i-i1', 'd-d1']);
  });

  it('handles an empty or missing payload', () => {
    expect(buildBrowseEntries()).toEqual([]);
    expect(buildBrowseEntries({ folders: undefined, documents: null })).toEqual([]);
  });
});

describe('folderName', () => {
  it('shows the system folder in the reader language and others as saved', () => {
    const t = (key, fallback) => (key === 'browse:sharedFolder' ? 'साझा' : fallback);
    expect(folderName(shared, t)).toBe('साझा');
    expect(folderName(papa, t)).toBe('Papa');
    expect(folderName(shared)).toBe('Shared');
    expect(folderName(null)).toBe('');
  });
});
