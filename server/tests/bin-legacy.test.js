import './helpers/setupPlatformOwnerEnv.js';
import './helpers/setupEnv.js';
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import sharp from 'sharp';
import mongoose from 'mongoose';
import { startTestDb, stopTestDb, clearDb } from './helpers/db.js';
import { buildApp, signupFamily, authed } from './helpers/factory.js';
import { PLATFORM_OWNER_EMAIL } from './helpers/setupPlatformOwnerEnv.js';
import { Document } from '../src/models/Document.js';
import { Folder } from '../src/models/Folder.js';
import { VaultItem } from '../src/models/VaultItem.js';
import { ANY_DELETED_STATE, backfillDeletedAt } from '../src/models/plugins/softDelete.js';
import { getDescendantFolderIds } from '../src/modules/folders/folderTree.js';

/*
 * "Legacy" rows = documents/folders/items created before soft delete shipped. In production they
 * have NO `deletedAt` field at all (Mongoose defaults only apply to docs it creates/saves), so
 * these tests insert them through the raw driver collection, bypassing Mongoose entirely.
 */

let app;

beforeAll(async () => {
  await startTestDb();
}, 60000);

afterAll(async () => {
  await stopTestDb();
});

beforeEach(async () => {
  app = buildApp();
  await clearDb();
});

const oid = (id) => new mongoose.Types.ObjectId(String(id));

async function pngBuffer() {
  return sharp({ create: { width: 8, height: 8, channels: 3, background: { r: 4, g: 5, b: 6 } } })
    .png()
    .toBuffer();
}

async function insertLegacyFolder(s, name, parentId = null) {
  const now = new Date();
  const { insertedId } = await Folder.collection.insertOne({
    familyId: oid(s.familyId),
    name,
    parentId: parentId ? oid(parentId) : null,
    color: '#FF5A5F',
    icon: '📁',
    createdBy: oid(s.membership.id),
    updatedBy: null,
    createdAt: now,
    updatedAt: now,
  });
  return String(insertedId);
}

async function insertLegacyDocument(s, folderId, title) {
  const now = new Date();
  const { insertedId } = await Document.collection.insertOne({
    familyId: oid(s.familyId),
    folderId: oid(folderId),
    title,
    typeId: null,
    memberId: null,
    tags: [],
    notes: '',
    expiryDate: null,
    customFields: [],
    files: [],
    createdBy: oid(s.membership.id),
    updatedBy: null,
    lastViewedAt: null,
    createdAt: now,
    updatedAt: now,
  });
  return String(insertedId);
}

async function insertLegacyItem(s, folderId, title) {
  const now = new Date();
  const { insertedId } = await VaultItem.collection.insertOne({
    familyId: oid(s.familyId),
    folderId: oid(folderId),
    kind: 'note',
    title,
    memberId: null,
    tags: [],
    fields: [],
    createdBy: oid(s.membership.id),
    updatedBy: null,
    createdAt: now,
    updatedAt: now,
  });
  return String(insertedId);
}

async function makeDocument(s, folderId, title = 'New doc') {
  const res = await authed(request(app).post('/api/documents'), s)
    .field('data', JSON.stringify({ title, folderId }))
    .field('labels', JSON.stringify(['x']))
    .attach('files', await pngBuffer(), { filename: 'x.png', contentType: 'image/png' });
  expect(res.status).toBe(201);
  return res.body.id;
}

async function rawHasField(Model, id) {
  const row = await Model.collection.findOne({ _id: oid(id) });
  return Object.prototype.hasOwnProperty.call(row, 'deletedAt');
}

describe('legacy rows without a deletedAt field', () => {
  it('are really stored without the field (sanity check for the rest of this suite)', async () => {
    const s = await signupFamily(app);
    const folderId = await insertLegacyFolder(s, 'Old folder');
    expect(await rawHasField(Folder, folderId)).toBe(false);
  });

  it('show up in normal lists, tree counts and lookups', async () => {
    const s = await signupFamily(app);
    const folderId = await insertLegacyFolder(s, 'Old folder');
    const subId = await insertLegacyFolder(s, 'Old sub', folderId);
    const docId = await insertLegacyDocument(s, folderId, 'Old passport');
    const itemId = await insertLegacyItem(s, folderId, 'Old note');

    const root = await authed(request(app).get('/api/folders/browse'), s);
    expect(root.status).toBe(200);
    const rootFolder = root.body.folders.find((f) => f.id === folderId);
    expect(rootFolder).toBeTruthy();
    expect(rootFolder.folderCount).toBe(1);
    expect(rootFolder.documentCount).toBe(1);

    const inside = await authed(request(app).get('/api/folders/browse'), s).query({ folderId });
    expect(inside.status).toBe(200);
    expect(inside.body.folders.map((f) => f.id)).toEqual([subId]);
    expect(inside.body.documents.map((d) => d.id)).toEqual([docId]);
    expect(inside.body.items.map((i) => i.id)).toEqual([itemId]);

    const tree = await authed(request(app).get('/api/folders/tree'), s);
    const treeIds = tree.body.items.map((f) => f.id);
    expect(treeIds).toContain(folderId);
    expect(treeIds).toContain(subId);

    const docs = await authed(request(app).get('/api/documents'), s);
    expect(docs.body.items.map((d) => d.id)).toEqual([docId]);
    expect(docs.body.total).toBe(1);

    const items = await authed(request(app).get('/api/items'), s);
    expect(items.body.items.map((i) => i.id)).toEqual([itemId]);

    const oneDoc = await authed(request(app).get(`/api/documents/${docId}`), s);
    expect(oneDoc.status).toBe(200);
  });

  it('never appear in the family bin', async () => {
    const s = await signupFamily(app);
    const folderId = await insertLegacyFolder(s, 'Old folder');
    await insertLegacyDocument(s, folderId, 'Old passport');
    await insertLegacyItem(s, folderId, 'Old note');

    const bin = await authed(request(app).get('/api/bin'), s);
    expect(bin.status).toBe(200);
    expect(bin.body.items).toEqual([]);
  });

  it('a binned document inside a legacy folder restores and is reachable in that folder again', async () => {
    const s = await signupFamily(app);
    const folderId = await insertLegacyFolder(s, 'Old folder');
    const docId = await makeDocument(s, folderId);

    await authed(request(app).delete(`/api/documents/${docId}`), s).expect(204);
    const bin = await authed(request(app).get('/api/bin'), s);
    expect(bin.body.items.map((i) => i.id)).toEqual([docId]);

    const restore = await authed(request(app).post(`/api/bin/document/${docId}/restore`), s);
    expect(restore.status).toBe(200);

    const inside = await authed(request(app).get('/api/folders/browse'), s).query({ folderId });
    expect(inside.status).toBe(200);
    expect(inside.body.documents.map((d) => d.id)).toEqual([docId]);
    // The legacy folder itself was never touched — still active, still field-less.
    expect(await rawHasField(Folder, folderId)).toBe(false);
  });

  it('a binned legacy document (own field set by the delete) restores', async () => {
    const s = await signupFamily(app);
    const folderId = await insertLegacyFolder(s, 'Old folder');
    const docId = await insertLegacyDocument(s, folderId, 'Old passport');

    await authed(request(app).delete(`/api/documents/${docId}`), s).expect(204);
    const restore = await authed(request(app).post(`/api/bin/document/${docId}/restore`), s);
    expect(restore.status).toBe(200);

    const oneDoc = await authed(request(app).get(`/api/documents/${docId}`), s);
    expect(oneDoc.status).toBe(200);
  });

  it('deleting then restoring a whole legacy folder subtree brings everything back', async () => {
    const s = await signupFamily(app);
    const parentId = await insertLegacyFolder(s, 'Old parent');
    const childId = await insertLegacyFolder(s, 'Old child', parentId);
    const docId = await insertLegacyDocument(s, childId, 'Old passport');
    const itemId = await insertLegacyItem(s, childId, 'Old note');

    await authed(request(app).delete(`/api/folders/${parentId}`), s).query({ confirm: 1 }).expect(200);
    const gone = await authed(request(app).get('/api/folders/browse'), s);
    expect(gone.body.folders.map((f) => f.id)).not.toContain(parentId);

    const restore = await authed(request(app).post(`/api/bin/folder/${parentId}/restore`), s);
    expect(restore.status).toBe(200);

    const child = await authed(request(app).get('/api/folders/browse'), s).query({ folderId: childId });
    expect(child.status).toBe(200);
    expect(child.body.documents.map((d) => d.id)).toEqual([docId]);
    expect(child.body.items.map((i) => i.id)).toEqual([itemId]);
  });
});

describe('ANY_DELETED_STATE bypass', () => {
  it('matches missing, null and dated deletedAt alike', async () => {
    const s = await signupFamily(app);
    const legacyId = await insertLegacyFolder(s, 'Legacy');
    const activeRes = await authed(request(app).post('/api/folders'), s).send({ name: 'Active', parentId: 'root' });
    const deletedRes = await authed(request(app).post('/api/folders'), s).send({ name: 'Deleted', parentId: 'root' });
    await authed(request(app).delete(`/api/folders/${deletedRes.body.id}`), s).query({ confirm: 1 }).expect(200);

    const ids = [legacyId, activeRes.body.id, deletedRes.body.id];
    const rows = await Folder.find({ _id: { $in: ids }, ...ANY_DELETED_STATE }).lean();
    expect(rows.map((r) => String(r._id)).sort()).toEqual([...ids].sort());
    // Without the bypass only the two with an active state come back.
    const active = await Folder.find({ _id: { $in: ids } }).lean();
    expect(active.map((r) => String(r._id)).sort()).toEqual([legacyId, activeRes.body.id].sort());

    const legacy = await Folder.findOne({ _id: legacyId, ...ANY_DELETED_STATE }).lean();
    expect(legacy).toBeTruthy();
  });

  it('the includeDeleted folder walk includes legacy descendants', async () => {
    const s = await signupFamily(app);
    const parentId = await insertLegacyFolder(s, 'Legacy parent');
    const childId = await insertLegacyFolder(s, 'Legacy child', parentId);

    const ids = await getDescendantFolderIds(s.familyId, parentId, { includeDeleted: true });
    expect(ids.map(String).sort()).toEqual([parentId, childId].sort());
  });
});

describe('platform bin around legacy rows', () => {
  it('the cross-family bin listing ignores active legacy rows', async () => {
    const owner = await signupFamily(app, { email: PLATFORM_OWNER_EMAIL });
    const other = await signupFamily(app);
    const folderId = await insertLegacyFolder(other, 'Old folder');
    await insertLegacyDocument(other, folderId, 'Old passport');
    await insertLegacyItem(other, folderId, 'Old note');
    const docId = await makeDocument(other, folderId);
    await authed(request(app).delete(`/api/documents/${docId}`), other).expect(204);

    const res = await authed(request(app).get('/api/platform-settings/bin'), owner);
    expect(res.status).toBe(200);
    expect(res.body.items.map((i) => i.id)).toEqual([docId]);
  });

  it('refuses to purge an active legacy row', async () => {
    const owner = await signupFamily(app, { email: PLATFORM_OWNER_EMAIL });
    const other = await signupFamily(app);
    const folderId = await insertLegacyFolder(other, 'Old folder');
    const docId = await insertLegacyDocument(other, folderId, 'Old passport');

    const res = await authed(request(app).post('/api/platform-settings/bin/purge'), owner).send({
      items: [
        { type: 'document', id: docId },
        { type: 'folder', id: folderId },
      ],
    });
    expect(res.status).toBe(200);
    expect(res.body.results.map((r) => r.purged)).toEqual([false, false]);

    expect(await Document.collection.findOne({ _id: oid(docId) })).toBeTruthy();
    expect(await Folder.collection.findOne({ _id: oid(folderId) })).toBeTruthy();
  });

  it('purging a binned document leaves its active legacy folder and siblings alone', async () => {
    const owner = await signupFamily(app, { email: PLATFORM_OWNER_EMAIL });
    const other = await signupFamily(app);
    const folderId = await insertLegacyFolder(other, 'Old folder');
    const siblingId = await insertLegacyDocument(other, folderId, 'Old sibling');
    const docId = await makeDocument(other, folderId);
    await authed(request(app).delete(`/api/documents/${docId}`), other).expect(204);

    const res = await authed(request(app).post('/api/platform-settings/bin/purge'), owner).send({
      items: [{ type: 'document', id: docId }],
    });
    expect(res.body.results).toEqual([{ type: 'document', id: docId, purged: true }]);

    expect(await Document.collection.findOne({ _id: oid(docId) })).toBeNull();
    const inside = await authed(request(app).get('/api/folders/browse'), other).query({ folderId });
    expect(inside.status).toBe(200);
    expect(inside.body.documents.map((d) => d.id)).toEqual([siblingId]);
  });

  it('purging a binned folder inside an active legacy parent removes only that subtree', async () => {
    const owner = await signupFamily(app, { email: PLATFORM_OWNER_EMAIL });
    const other = await signupFamily(app);
    const parentId = await insertLegacyFolder(other, 'Old parent');
    const keepDocId = await insertLegacyDocument(other, parentId, 'Keep me');
    const childId = await insertLegacyFolder(other, 'Old child', parentId);
    const childDocId = await insertLegacyDocument(other, childId, 'Purge me');
    await authed(request(app).delete(`/api/folders/${childId}`), other).query({ confirm: 1 }).expect(200);

    const res = await authed(request(app).post('/api/platform-settings/bin/purge'), owner).send({
      items: [{ type: 'folder', id: childId }],
    });
    expect(res.body.results).toEqual([{ type: 'folder', id: childId, purged: true }]);

    expect(await Folder.collection.findOne({ _id: oid(childId) })).toBeNull();
    expect(await Document.collection.findOne({ _id: oid(childDocId) })).toBeNull();
    expect(await Folder.collection.findOne({ _id: oid(parentId) })).toBeTruthy();
    expect(await Document.collection.findOne({ _id: oid(keepDocId) })).toBeTruthy();
  });
});

describe('backfillDeletedAt (startup)', () => {
  it('adds deletedAt: null to legacy rows only, leaves binned rows alone, and is idempotent', async () => {
    const s = await signupFamily(app);
    const folderId = await insertLegacyFolder(s, 'Old folder');
    const docId = await insertLegacyDocument(s, folderId, 'Old passport');
    const itemId = await insertLegacyItem(s, folderId, 'Old note');
    const binnedId = await makeDocument(s, folderId);
    await authed(request(app).delete(`/api/documents/${binnedId}`), s).expect(204);
    const binnedBefore = await Document.collection.findOne({ _id: oid(binnedId) });

    const first = await backfillDeletedAt([Document, Folder, VaultItem]);
    expect(first).toEqual({ Document: 1, Folder: 1, VaultItem: 1 });
    for (const [Model, id] of [[Document, docId], [Folder, folderId], [VaultItem, itemId]]) {
      // eslint-disable-next-line no-await-in-loop
      const row = await Model.collection.findOne({ _id: oid(id) });
      expect(row.deletedAt).toBeNull();
      expect(row.deletedBy).toBeNull();
    }
    const binnedAfter = await Document.collection.findOne({ _id: oid(binnedId) });
    expect(binnedAfter.deletedAt).toEqual(binnedBefore.deletedAt);
    expect(binnedAfter.deletedBy).toEqual(binnedBefore.deletedBy);

    const second = await backfillDeletedAt([Document, Folder, VaultItem]);
    expect(second).toEqual({ Document: 0, Folder: 0, VaultItem: 0 });

    const inside = await authed(request(app).get('/api/folders/browse'), s).query({ folderId });
    expect(inside.body.documents.map((d) => d.id)).toEqual([docId]);
    const bin = await authed(request(app).get('/api/bin'), s);
    expect(bin.body.items.map((i) => i.id)).toEqual([binnedId]);
  });
});
