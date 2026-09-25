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
    expect(Array.isArray(subBrowse.body.items)).toBe(true); // wired to items integration stub -> []
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
    expect(tree.body.items.map((f) => f.id)).toEqual([top.body.id]);

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
