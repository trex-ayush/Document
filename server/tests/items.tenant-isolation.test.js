import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import request from 'supertest';

import { createApp } from '../src/app.js';
import { Family } from '../src/models/Family.js';
import { User } from '../src/models/User.js';
import { Membership } from '../src/models/Membership.js';
import { Folder } from '../src/models/Folder.js';
import { VaultItem } from '../src/models/VaultItem.js';
import { signAccessToken } from '../src/utils/tokens.js';

let mongod;
let app;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  await Promise.all([Family.init(), User.init(), Membership.init(), Folder.init(), VaultItem.init()]);
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

describe('tenant isolation: family A cannot reach family B vault items', () => {
  it('GET/PATCH/DELETE /items/:id 404 for an item belonging to another family', async () => {
    const a = await makeFamilyWithAdmin('A');
    const b = await makeFamilyWithAdmin('B');
    const folderB = await Folder.create({ familyId: b.family._id, name: 'B Folder', parentId: null, createdBy: b.membership._id });

    const createRes = await request(app)
      .post('/api/items')
      .set(b.auth)
      .send({ title: 'B secret login', folderId: String(folderB._id), kind: 'login' });
    expect(createRes.status).toBe(201);
    const bItemId = createRes.body.id;

    const crossGet = await request(app).get(`/api/items/${bItemId}`).set(a.auth);
    expect(crossGet.status).toBe(404);

    const crossPatch = await request(app).patch(`/api/items/${bItemId}`).set(a.auth).send({ title: 'pwned' });
    expect(crossPatch.status).toBe(404);

    const crossDelete = await request(app).delete(`/api/items/${bItemId}`).set(a.auth);
    expect(crossDelete.status).toBe(404);

    const crossActivity = await request(app).get(`/api/items/${bItemId}/activity`).set(a.auth);
    expect(crossActivity.status).toBe(404);

    // B's own token still works, and the item survived every cross-tenant attempt untouched.
    const ownRes = await request(app).get(`/api/items/${bItemId}`).set(b.auth);
    expect(ownRes.status).toBe(200);
    expect(ownRes.body.title).toBe('B secret login');
  });

  it('a family A item cannot be created inside a family B folder', async () => {
    const a = await makeFamilyWithAdmin('A2');
    const b = await makeFamilyWithAdmin('B2');
    const folderB = await Folder.create({ familyId: b.family._id, name: 'B Folder', parentId: null, createdBy: b.membership._id });

    const res = await request(app)
      .post('/api/items')
      .set(a.auth)
      .send({ title: 'Should fail', folderId: String(folderB._id), kind: 'note' });
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('FOLDER_NOT_FOUND');
  });

  it('GET /items (list) for family A never includes family B items', async () => {
    const a = await makeFamilyWithAdmin('A3');
    const b = await makeFamilyWithAdmin('B3');
    const folderA = await Folder.create({ familyId: a.family._id, name: 'A Folder', parentId: null, createdBy: a.membership._id });
    const folderB = await Folder.create({ familyId: b.family._id, name: 'B Folder', parentId: null, createdBy: b.membership._id });

    await request(app).post('/api/items').set(a.auth).send({ title: 'A item', folderId: String(folderA._id), kind: 'note' });
    await request(app).post('/api/items').set(b.auth).send({ title: 'B item', folderId: String(folderB._id), kind: 'note' });

    const listA = await request(app).get('/api/items').set(a.auth);
    expect(listA.body.items.map((i) => i.title)).toEqual(['A item']);
  });

  it("family A's reveal token cannot unlock family B's item field (reauth is scoped by familyId)", async () => {
    const a = await makeFamilyWithAdmin('A4');
    const b = await makeFamilyWithAdmin('B4');
    const folderB = await Folder.create({ familyId: b.family._id, name: 'B Folder', parentId: null, createdBy: b.membership._id });

    const createRes = await request(app)
      .post('/api/items')
      .set(b.auth)
      .send({
        title: 'B login',
        folderId: String(folderB._id),
        kind: 'login',
        fields: [{ key: 'password', value: 'topsecret', sensitive: true }],
      });
    const bItemId = createRes.body.id;
    const bFieldId = createRes.body.fields[0].id;

    // Family A can't even see the item to get a fieldId, but even a well-formed attempt 404s
    // before ever reaching the reauth check.
    const revealRes = await request(app).get(`/api/items/${bItemId}/fields/${bFieldId}/reveal`).set(a.auth);
    expect(revealRes.status).toBe(404);
  });
});
