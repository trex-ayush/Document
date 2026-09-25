import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import request from 'supertest';
import sharp from 'sharp';

import { createApp } from '../src/app.js';
import { Family } from '../src/models/Family.js';
import { User } from '../src/models/User.js';
import { Membership } from '../src/models/Membership.js';
import { Folder } from '../src/models/Folder.js';
import { Document } from '../src/models/Document.js';
import { signAccessToken } from '../src/utils/tokens.js';
import { getSharedFolderId, buildFolderPaths } from '../src/modules/folders/sharedFolder.js';

// supertest/superagent only auto-buffers text/json response bodies into `res.body` — binary
// content types (application/zip here) need an explicit raw-buffer parser.
function binaryParser(res, cb) {
  const chunks = [];
  res.on('data', (chunk) => chunks.push(chunk));
  res.on('end', () => cb(null, Buffer.concat(chunks)));
}

async function pngBuffer() {
  return sharp({ create: { width: 12, height: 8, channels: 3, background: { r: 200, g: 60, b: 60 } } })
    .png()
    .toBuffer();
}

let mongod;
let app;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  await Promise.all([Family.init(), User.init(), Membership.init(), Folder.init(), Document.init()]);
  app = createApp();
}, 60000);

afterAll(async () => {
  await mongoose.disconnect();
  if (mongod) await mongod.stop();
});

beforeEach(async () => {
  const { collections } = mongoose.connection;
  await Promise.all(Object.values(collections).map((c) => c.deleteMany({})));
});

async function makeFamilyWithAdmin() {
  const uniq = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const user = await User.create({ name: 'Admin User', email: `admin-${uniq}@test.com`, passwordHash: 'x', googleId: `no-google-${uniq}` });
  const family = await Family.create({ name: 'Test Family', slug: `test-family-${uniq}`, createdBy: user._id });
  const membership = await Membership.create({
    familyId: family._id,
    userId: user._id,
    name: user.name,
    role: 'admin',
    access: 'write',
    isOwner: true,
    canLogin: true,
    status: 'active',
  });
  // Multi-family sessions (docs/API.md): the access token only proves WHO is calling — `which
  // family` now comes from the X-Family-Id header, resolved server-side against this Membership.
  const token = signAccessToken({ userId: user._id });
  return {
    family,
    user,
    membership,
    token,
    auth: { Authorization: `Bearer ${token}`, 'X-Family-Id': String(family._id) },
  };
}

describe('folders: tree, browse, CRUD, move, delete, zip-link', () => {
  it('creates nested folders and lists them via /folders/tree with counts', async () => {
    const { auth } = await makeFamilyWithAdmin();

    const rootRes = await request(app).post('/api/folders').set(auth).send({ name: 'Identity', parentId: 'root' });
    expect(rootRes.status).toBe(201);
    const rootId = rootRes.body.id;

    const childRes = await request(app)
      .post('/api/folders')
      .set(auth)
      .send({ name: 'Passports', parentId: rootId });
    expect(childRes.status).toBe(201);
    expect(childRes.body.parentId).toBe(rootId);

    const treeRes = await request(app).get('/api/folders/tree').set(auth);
    expect(treeRes.status).toBe(200);
    const root = treeRes.body.items.find((f) => f.id === rootId);
    expect(root.folderCount).toBe(1);
  });

  it('browse?folderId=root shows top-level folders; browsing into a folder shows breadcrumbs + items[]', async () => {
    const { auth } = await makeFamilyWithAdmin();
    const rootRes = await request(app).post('/api/folders').set(auth).send({ name: 'Financial', parentId: 'root' });
    const rootId = rootRes.body.id;

    const rootBrowse = await request(app).get('/api/folders/browse').query({ folderId: 'root' }).set(auth);
    expect(rootBrowse.status).toBe(200);
    expect(rootBrowse.body.folder).toBeNull();
    expect(rootBrowse.body.breadcrumbs).toEqual([]);
    expect(rootBrowse.body.folders.map((f) => f.id)).toContain(rootId);

    const subBrowse = await request(app).get('/api/folders/browse').query({ folderId: rootId }).set(auth);
    expect(subBrowse.status).toBe(200);
    expect(subBrowse.body.folder.id).toBe(rootId);
    expect(subBrowse.body.breadcrumbs).toHaveLength(1);
    expect(subBrowse.body.breadcrumbs[0].id).toBe(rootId);
    expect(subBrowse.body.items).toEqual([]);
  });

  it('PATCH move: rejects moving a folder into its own descendant', async () => {
    const { auth } = await makeFamilyWithAdmin();
    const parentRes = await request(app).post('/api/folders').set(auth).send({ name: 'Parent', parentId: 'root' });
    const parentId = parentRes.body.id;
    const childRes = await request(app).post('/api/folders').set(auth).send({ name: 'Child', parentId });
    const childId = childRes.body.id;
    const grandchildRes = await request(app).post('/api/folders').set(auth).send({ name: 'Grandchild', parentId: childId });
    const grandchildId = grandchildRes.body.id;

    const badMove = await request(app).patch(`/api/folders/${parentId}`).set(auth).send({ parentId: grandchildId });
    expect(badMove.status).toBe(400);
    expect(badMove.body.code).toBe('CANNOT_MOVE_INTO_DESCENDANT');

    const selfMove = await request(app).patch(`/api/folders/${parentId}`).set(auth).send({ parentId });
    expect(selfMove.status).toBe(400);
    expect(selfMove.body.code).toBe('CANNOT_MOVE_INTO_DESCENDANT');

    // a legitimate move (grandchild directly under root) should succeed
    const goodMove = await request(app).patch(`/api/folders/${grandchildId}`).set(auth).send({ parentId: 'root' });
    expect(goodMove.status).toBe(200);
    expect(goodMove.body.parentId).toBeNull();
  });

  it('DELETE requires ?confirm=1 and recursively removes subfolders + documents + files', async () => {
    const { auth } = await makeFamilyWithAdmin();
    const parentRes = await request(app).post('/api/folders').set(auth).send({ name: 'Parent', parentId: 'root' });
    const parentId = parentRes.body.id;
    const childRes = await request(app).post('/api/folders').set(auth).send({ name: 'Child', parentId });
    const childId = childRes.body.id;

    const docRes = await request(app)
      .post('/api/documents')
      .set(auth)
      .field('data', JSON.stringify({ title: 'Inside child', folderId: childId }))
      .field('labels', JSON.stringify(['x']))
      .attach('files', await pngBuffer(), { filename: 'x.png', contentType: 'image/png' });
    expect(docRes.status).toBe(201);

    const precheck = await request(app).delete(`/api/folders/${parentId}`).set(auth);
    expect(precheck.status).toBe(200);
    expect(precheck.body.requiresConfirm).toBe(true);
    expect(precheck.body.folderCount).toBe(1);
    expect(precheck.body.documentCount).toBe(1);
    expect(precheck.body.fileCount).toBe(1);

    const del = await request(app).delete(`/api/folders/${parentId}`).query({ confirm: 1 }).set(auth);
    expect(del.status).toBe(200);

    const parentGone = await Folder.findById(parentId);
    const childGone = await Folder.findById(childId);
    const docGone = await Document.findById(docRes.body.id);
    expect(parentGone).toBeNull();
    expect(childGone).toBeNull();
    expect(docGone).toBeNull();
  });

  it('nests folders several levels deep with a full root-first breadcrumb trail', async () => {
    const { auth } = await makeFamilyWithAdmin();
    const a = await request(app).post('/api/folders').set(auth).send({ name: 'Mummy', parentId: 'root' });
    const b = await request(app).post('/api/folders').set(auth).send({ name: 'Medical', parentId: a.body.id });
    const c = await request(app).post('/api/folders').set(auth).send({ name: '2026', parentId: b.body.id });
    expect(c.status).toBe(201);
    expect(c.body.parentId).toBe(b.body.id);

    const browse = await request(app).get('/api/folders/browse').query({ folderId: c.body.id }).set(auth);
    expect(browse.status).toBe(200);
    expect(browse.body.breadcrumbs.map((f) => f.name)).toEqual(['Mummy', 'Medical', '2026']);

    const mid = await request(app).get('/api/folders/browse').query({ folderId: b.body.id }).set(auth);
    expect(mid.body.folders.map((f) => f.id)).toEqual([c.body.id]);
  });

  it('browse rejects a malformed folderId with 400 instead of a server error', async () => {
    const { auth } = await makeFamilyWithAdmin();
    const res = await request(app).get('/api/folders/browse').query({ folderId: 'not-an-id' }).set(auth);
    expect(res.status).toBe(400);
  });

  it('PATCH rename: trims the name, keeps the folder where it is, rejects blank or overlong names', async () => {
    const { auth } = await makeFamilyWithAdmin();
    const parent = await request(app).post('/api/folders').set(auth).send({ name: 'Papa', parentId: 'root' });
    const child = await request(app).post('/api/folders').set(auth).send({ name: 'Bank', parentId: parent.body.id });

    const renamed = await request(app).patch(`/api/folders/${child.body.id}`).set(auth).send({ name: '  Bank papers  ' });
    expect(renamed.status).toBe(200);
    expect(renamed.body.name).toBe('Bank papers');
    expect(renamed.body.parentId).toBe(parent.body.id);

    const crumbs = await request(app).get('/api/folders/browse').query({ folderId: child.body.id }).set(auth);
    expect(crumbs.body.breadcrumbs.map((f) => f.name)).toEqual(['Papa', 'Bank papers']);

    const blank = await request(app).patch(`/api/folders/${child.body.id}`).set(auth).send({ name: '   ' });
    expect(blank.status).toBe(400);
    const tooLong = await request(app).patch(`/api/folders/${child.body.id}`).set(auth).send({ name: 'x'.repeat(121) });
    expect(tooLong.status).toBe(400);

    const stored = await Folder.findById(child.body.id).lean();
    expect(stored.name).toBe('Bank papers');
  });

  it('DELETE soft-deletes the whole subtree into the Bin: gone from tree/browse, rows kept with deletedAt', async () => {
    const { auth } = await makeFamilyWithAdmin();
    const top = await request(app).post('/api/folders').set(auth).send({ name: 'Keep', parentId: 'root' });
    const parent = await request(app).post('/api/folders').set(auth).send({ name: 'Mummy', parentId: 'root' });
    const child = await request(app).post('/api/folders').set(auth).send({ name: 'Medical', parentId: parent.body.id });
    const grand = await request(app).post('/api/folders').set(auth).send({ name: 'Reports', parentId: child.body.id });
    const docRes = await request(app)
      .post('/api/documents')
      .set(auth)
      .field('data', JSON.stringify({ title: 'Deep doc', folderId: grand.body.id }))
      .field('labels', JSON.stringify(['x']))
      .attach('files', await pngBuffer(), { filename: 'x.png', contentType: 'image/png' });
    expect(docRes.status).toBe(201);

    const precheck = await request(app).delete(`/api/folders/${parent.body.id}`).set(auth);
    expect(precheck.body).toMatchObject({ requiresConfirm: true, folderCount: 2, documentCount: 1, fileCount: 1 });

    const del = await request(app).delete(`/api/folders/${parent.body.id}`).query({ confirm: 1 }).set(auth);
    expect(del.status).toBe(200);
    expect(del.body.requiresConfirm).toBe(false);

    // Raw collection reads bypass the soft-delete plugin: the rows still exist, just marked deleted.
    for (const id of [parent.body.id, child.body.id, grand.body.id]) {
      // eslint-disable-next-line no-await-in-loop
      const raw = await Folder.collection.findOne({ _id: new mongoose.Types.ObjectId(id) });
      expect(raw).not.toBeNull();
      expect(raw.deletedAt).toBeInstanceOf(Date);
    }
    const rawDoc = await Document.collection.findOne({ _id: new mongoose.Types.ObjectId(docRes.body.id) });
    expect(rawDoc.deletedAt).toBeInstanceOf(Date);

    const tree = await request(app).get('/api/folders/tree').set(auth);
    expect(tree.body.items.map((f) => f.name)).toEqual(['Shared', 'Keep']);

    const browseDeleted = await request(app).get('/api/folders/browse').query({ folderId: child.body.id }).set(auth);
    expect(browseDeleted.status).toBe(404);

    const createInside = await request(app).post('/api/folders').set(auth).send({ name: 'Nope', parentId: parent.body.id });
    expect(createInside.status).toBe(404);

    const moveInto = await request(app).patch(`/api/folders/${top.body.id}`).set(auth).send({ parentId: grand.body.id });
    expect(moveInto.status).toBe(404);
  });

  it('POST /folders/:id/zip-link returns a downloadable URL that streams a zip', async () => {
    const { auth } = await makeFamilyWithAdmin();
    const folderRes = await request(app).post('/api/folders').set(auth).send({ name: 'ZipMe', parentId: 'root' });
    const folderId = folderRes.body.id;
    await request(app)
      .post('/api/documents')
      .set(auth)
      .field('data', JSON.stringify({ title: 'Doc in zip', folderId }))
      .field('labels', JSON.stringify(['x']))
      .attach('files', await pngBuffer(), { filename: 'x.png', contentType: 'image/png' });

    const linkRes = await request(app).post(`/api/folders/${folderId}/zip-link`).set(auth);
    expect(linkRes.status).toBe(200);
    expect(linkRes.body.url).toMatch(/^\/api\/files\/zip\//);

    const zipRes = await request(app).get(linkRes.body.url).buffer(true).parse(binaryParser);
    expect(zipRes.status).toBe(200);
    expect(zipRes.headers['content-type']).toBe('application/zip');
    expect(zipRes.headers['content-disposition']).toContain('attachment');
    // PK\x03\x04 is the local-file-header magic for a zip archive
    expect(zipRes.body.slice(0, 2).toString()).toBe('PK');
  });
});

describe('the Shared system folder', () => {
  it('always exists at the top level, first in the list, flagged isSystem, with no colour/icon', async () => {
    const { auth } = await makeFamilyWithAdmin();
    await request(app).post('/api/folders').set(auth).send({ name: 'Amma', parentId: 'root' });
    await request(app).post('/api/folders').set(auth).send({ name: 'Papa' });

    const browse = await request(app).get('/api/folders/browse').set(auth);
    expect(browse.status).toBe(200);
    expect(browse.body.folders.map((f) => f.name)).toEqual(['Shared', 'Amma', 'Papa']);
    expect(browse.body.folders[0].isSystem).toBe(true);
    expect(browse.body.folders[1].isSystem).toBe(false);
    for (const f of browse.body.folders) {
      expect(f.color).toBeUndefined();
      expect(f.icon).toBeUndefined();
    }
    // The top level holds only folders.
    expect(browse.body.documents).toEqual([]);
    expect(browse.body.items).toEqual([]);

    const tree = await request(app).get('/api/folders/tree').set(auth);
    expect(tree.body.items.filter((f) => f.isSystem)).toHaveLength(1);
  });

  it('cannot be renamed, moved or deleted (400 SYSTEM_FOLDER)', async () => {
    const { family, auth } = await makeFamilyWithAdmin();
    const sharedId = await getSharedFolderId(family._id);
    const other = await request(app).post('/api/folders').set(auth).send({ name: 'Other' });

    const rename = await request(app).patch(`/api/folders/${sharedId}`).set(auth).send({ name: 'Mine' });
    expect(rename.status).toBe(400);
    expect(rename.body.code).toBe('SYSTEM_FOLDER');

    const move = await request(app).patch(`/api/folders/${sharedId}`).set(auth).send({ parentId: other.body.id });
    expect(move.status).toBe(400);
    expect(move.body.code).toBe('SYSTEM_FOLDER');

    const precheck = await request(app).delete(`/api/folders/${sharedId}`).set(auth);
    expect(precheck.status).toBe(400);
    expect(precheck.body.code).toBe('SYSTEM_FOLDER');
    const del = await request(app).delete(`/api/folders/${sharedId}`).query({ confirm: 1 }).set(auth);
    expect(del.status).toBe(400);

    const stored = await Folder.findById(sharedId).lean();
    expect(stored).toMatchObject({ name: 'Shared', parentId: null, isSystem: true, systemKey: 'shared' });
  });

  it('no user folder may be named "Shared" (any case, trimmed) or "साझा", at any level (400 RESERVED_FOLDER_NAME)', async () => {
    const { family, auth } = await makeFamilyWithAdmin();
    const sharedId = await getSharedFolderId(family._id);
    const papa = await request(app).post('/api/folders').set(auth).send({ name: 'Papa' });

    for (const name of ['Shared', 'shared', '  SHARED  ', 'sHaReD', 'साझा', ' साझा ']) {
      for (const parentId of ['root', papa.body.id, sharedId]) {
        // eslint-disable-next-line no-await-in-loop
        const res = await request(app).post('/api/folders').set(auth).send({ name, parentId });
        expect(res.status).toBe(400);
        expect(res.body.code).toBe('RESERVED_FOLDER_NAME');
        expect(res.body.message).toMatch(/Shared/);
      }
      // eslint-disable-next-line no-await-in-loop
      const rename = await request(app).patch(`/api/folders/${papa.body.id}`).set(auth).send({ name });
      expect(rename.status).toBe(400);
      expect(rename.body.code).toBe('RESERVED_FOLDER_NAME');
    }

    // Names that merely contain the word are fine.
    const ok = await request(app).post('/api/folders').set(auth).send({ name: 'Shared bills' });
    expect(ok.status).toBe(201);
    const renamed = await request(app).patch(`/api/folders/${papa.body.id}`).set(auth).send({ name: 'Unshared' });
    expect(renamed.status).toBe(200);

    // Only the one system Shared folder exists, unchanged.
    const shared = await Folder.find({ familyId: family._id, name: { $in: ['Shared', 'shared', 'SHARED', 'sHaReD', 'साझा'] } }).lean();
    expect(shared).toHaveLength(1);
    expect(shared[0]).toMatchObject({ isSystem: true, systemKey: 'shared' });
    const stillPapa = await Folder.findById(papa.body.id).lean();
    expect(stillPapa.name).toBe('Unshared');
  });

  it('an older user folder already named "Shared" can still be moved with its unchanged name', async () => {
    const { family, membership, auth } = await makeFamilyWithAdmin();
    const legacy = await Folder.create({ familyId: family._id, name: 'Shared', parentId: null, createdBy: membership._id });
    const target = await request(app).post('/api/folders').set(auth).send({ name: 'Target' });

    const move = await request(app)
      .patch(`/api/folders/${legacy._id}`)
      .set(auth)
      .send({ name: 'Shared', parentId: target.body.id });
    expect(move.status).toBe(200);
    const rename = await request(app).patch(`/api/folders/${legacy._id}`).set(auth).send({ name: 'Old shared stuff' });
    expect(rename.status).toBe(200);
  });

  it('can hold subfolders, and other folders can be moved into it', async () => {
    const { family, auth } = await makeFamilyWithAdmin();
    const sharedId = await getSharedFolderId(family._id);

    const sub = await request(app).post('/api/folders').set(auth).send({ name: 'Bills', parentId: sharedId });
    expect(sub.status).toBe(201);
    const papa = await request(app).post('/api/folders').set(auth).send({ name: 'Papa' });
    const moved = await request(app).patch(`/api/folders/${papa.body.id}`).set(auth).send({ parentId: sharedId });
    expect(moved.status).toBe(200);

    const browse = await request(app).get('/api/folders/browse').query({ folderId: sharedId }).set(auth);
    expect(browse.body.folder.isSystem).toBe(true);
    expect(browse.body.folders.map((f) => f.name)).toEqual(['Bills', 'Papa']);
  });

  it('counts documents and items per folder', async () => {
    const { auth } = await makeFamilyWithAdmin();
    const folder = await request(app).post('/api/folders').set(auth).send({ name: 'Rahul' });
    await request(app)
      .post('/api/documents')
      .set(auth)
      .field('data', JSON.stringify({ title: 'Marksheet', folderId: folder.body.id }))
      .attach('files', await pngBuffer(), { filename: 'x.png', contentType: 'image/png' });
    await request(app).post('/api/items').set(auth).send({ kind: 'note', title: 'Roll no', folderId: folder.body.id });
    await request(app).post('/api/items').set(auth).send({ kind: 'login', title: 'School portal', folderId: folder.body.id });

    const browse = await request(app).get('/api/folders/browse').set(auth);
    const rahul = browse.body.folders.find((f) => f.id === folder.body.id);
    expect(rahul).toMatchObject({ documentCount: 1, itemCount: 2, folderCount: 0 });

    const precheck = await request(app).delete(`/api/folders/${folder.body.id}`).set(auth);
    expect(precheck.body).toMatchObject({ requiresConfirm: true, documentCount: 1, itemCount: 2, fileCount: 1 });
  });

  it('getSharedFolderId is idempotent and buildFolderPaths returns "Shared › Papa" style paths', async () => {
    const { family, membership } = await makeFamilyWithAdmin();
    const [id1, id2] = await Promise.all([getSharedFolderId(family._id), getSharedFolderId(family._id)]);
    expect(id1).toBe(id2);
    expect(await Folder.countDocuments({ familyId: family._id, systemKey: 'shared' })).toBe(1);

    const papa = await Folder.create({ familyId: family._id, name: 'Papa', parentId: id1, createdBy: membership._id });
    const bank = await Folder.create({ familyId: family._id, name: 'Bank', parentId: papa._id, createdBy: membership._id });
    const top = await Folder.create({ familyId: family._id, name: 'Rahul', parentId: null, createdBy: membership._id });
    await Folder.create({ familyId: family._id, name: 'Binned', parentId: null, createdBy: membership._id, deletedAt: new Date() });

    const paths = await buildFolderPaths(family._id);
    expect(paths.get(id1)).toBe('Shared');
    expect(paths.get(String(papa._id))).toBe('Shared › Papa');
    expect(paths.get(String(bank._id))).toBe('Shared › Papa › Bank');
    expect(paths.get(String(top._id))).toBe('Rahul');
    expect(paths.size).toBe(4);
  });
});
