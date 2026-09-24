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

async function makeFamilyWithAdmin(label) {
  const uniq = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const user = await User.create({ name: `${label} Admin`, email: `${label}-${uniq}@test.com`, passwordHash: 'x', googleId: `no-google-${uniq}` });
  const family = await Family.create({ name: `${label} Family`, slug: `${label}-family-${uniq}`, createdBy: user._id });
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
  const token = signAccessToken({
    userId: user._id,
    membershipId: membership._id,
    familyId: family._id,
    role: membership.role,
    access: membership.access,
  });
  return { family, user, membership, token, auth: { Authorization: `Bearer ${token}` } };
}

describe('tenant isolation: family A cannot reach family B data via folders/documents/files', () => {
  it('GET /documents/:id 404s for a document that belongs to another family (so no file token is ever minted for it)', async () => {
    const a = await makeFamilyWithAdmin('A');
    const b = await makeFamilyWithAdmin('B');

    const folderB = await Folder.create({ familyId: b.family._id, name: 'B Folder', parentId: null, createdBy: b.membership._id });
    const createRes = await request(app)
      .post('/api/documents')
      .set(b.auth)
      .field('data', JSON.stringify({ title: 'B secret doc', folderId: String(folderB._id) }))
      .field('labels', JSON.stringify(['x']))
      .attach('files', await pngBuffer(), { filename: 'x.png', contentType: 'image/png' });
    expect(createRes.status).toBe(201);
    const bDocId = createRes.body.id;

    // Family A, using its own valid access token, tries to read family B's document.
    const crossRes = await request(app).get(`/api/documents/${bDocId}`).set(a.auth);
    expect(crossRes.status).toBe(404);

    // Since GET /documents/:id is the only place a file token gets minted from, A never receives
    // a usable url/thumbUrl/downloadUrl for any of B's files — nothing to attach/replace/delete
    // either.
    const crossPatch = await request(app).patch(`/api/documents/${bDocId}`).set(a.auth).send({ title: 'pwned' });
    expect(crossPatch.status).toBe(404);
    const crossDelete = await request(app).delete(`/api/documents/${bDocId}`).set(a.auth);
    expect(crossDelete.status).toBe(404);

    // B's own token still works fine.
    const ownRes = await request(app).get(`/api/documents/${bDocId}`).set(b.auth);
    expect(ownRes.status).toBe(200);
  });

  it('GET /documents (list) for family A never includes family B documents', async () => {
    const a = await makeFamilyWithAdmin('A2');
    const b = await makeFamilyWithAdmin('B2');
    const folderA = await Folder.create({ familyId: a.family._id, name: 'A Folder', parentId: null, createdBy: a.membership._id });
    const folderB = await Folder.create({ familyId: b.family._id, name: 'B Folder', parentId: null, createdBy: b.membership._id });

    await request(app)
      .post('/api/documents')
      .set(a.auth)
      .field('data', JSON.stringify({ title: 'A doc', folderId: String(folderA._id) }))
      .field('labels', JSON.stringify(['x']))
      .attach('files', await pngBuffer(), { filename: 'x.png', contentType: 'image/png' });
    await request(app)
      .post('/api/documents')
      .set(b.auth)
      .field('data', JSON.stringify({ title: 'B doc', folderId: String(folderB._id) }))
      .field('labels', JSON.stringify(['x']))
      .attach('files', await pngBuffer(), { filename: 'x.png', contentType: 'image/png' });

    const listA = await request(app).get('/api/documents').set(a.auth);
    expect(listA.body.items.map((d) => d.title)).toEqual(['A doc']);
  });

  it('folders: family A cannot browse, move, or delete family B folders', async () => {
    const a = await makeFamilyWithAdmin('A3');
    const b = await makeFamilyWithAdmin('B3');
    const folderB = await Folder.create({ familyId: b.family._id, name: 'B Folder', parentId: null, createdBy: b.membership._id });

    const browseRes = await request(app).get('/api/folders/browse').query({ folderId: String(folderB._id) }).set(a.auth);
    expect(browseRes.status).toBe(404);

    const patchRes = await request(app).patch(`/api/folders/${folderB._id}`).set(a.auth).send({ name: 'pwned' });
    expect(patchRes.status).toBe(404);

    const deleteRes = await request(app).delete(`/api/folders/${folderB._id}`).query({ confirm: 1 }).set(a.auth);
    expect(deleteRes.status).toBe(404);

    const zipLinkRes = await request(app).post(`/api/folders/${folderB._id}/zip-link`).set(a.auth);
    expect(zipLinkRes.status).toBe(404);

    const bFolderStillThere = await Folder.findById(folderB._id);
    expect(bFolderStillThere).not.toBeNull();
    expect(bFolderStillThere.name).toBe('B Folder');
  });
});
