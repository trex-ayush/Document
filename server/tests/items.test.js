import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import request from 'supertest';

import { createApp } from '../src/app.js';
import { Family } from '../src/models/Family.js';
import { User } from '../src/models/User.js';
import { Membership } from '../src/models/Membership.js';
import { Folder } from '../src/models/Folder.js';
import { Document } from '../src/models/Document.js';
import { VaultItem } from '../src/models/VaultItem.js';
import { Share } from '../src/models/Share.js';
import { signAccessToken, signReauthToken } from '../src/utils/tokens.js';

let mongod;
let app;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  await Promise.all([Family.init(), User.init(), Membership.init(), Folder.init(), Document.init(), VaultItem.init()]);
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

async function makeFamilyWithAdmin(settingsOverride = {}) {
  const uniq = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const user = await User.create({ name: 'Admin User', email: `admin-${uniq}@test.com`, passwordHash: 'x', googleId: `no-google-${uniq}` });
  const family = await Family.create({
    name: 'Test Family',
    slug: `test-family-${uniq}`,
    createdBy: user._id,
    settings: { activityRetentionDays: 365, requireReauthForSecrets: true, ...settingsOverride },
  });
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

async function makeFolder(familyId, membershipId, overrides = {}) {
  return Folder.create({ familyId, name: 'Passwords & Logins', parentId: null, createdBy: membershipId, ...overrides });
}

describe('items: CRUD + list/search filters', () => {
  it('creates a login item, lists it, updates it, then deletes it', async () => {
    const { family, membership, auth } = await makeFamilyWithAdmin();
    const folder = await makeFolder(family._id, membership._id);

    const createRes = await request(app)
      .post('/api/items')
      .set(auth)
      .send({
        title: 'Netflix',
        folderId: folder._id.toString(),
        kind: 'login',
        tags: ['streaming'],
        fields: [
          { key: 'username', value: 'ayush@example.com', type: 'email', sensitive: false },
          { key: 'password', value: 'S3cr3t!', type: 'text', sensitive: true },
        ],
      });
    expect(createRes.status).toBe(201);
    expect(createRes.body.kind).toBe('login');
    expect(createRes.body.fields).toHaveLength(2);
    const passwordField = createRes.body.fields.find((f) => f.key === 'password');
    expect(passwordField.sensitive).toBe(true);
    expect(passwordField.value).toBeUndefined();
    expect(passwordField.masked).toContain('••••');
    expect(JSON.stringify(createRes.body)).not.toContain('S3cr3t!');

    const itemId = createRes.body.id;

    const listRes = await request(app).get('/api/items').set(auth);
    expect(listRes.status).toBe(200);
    expect(listRes.body.items).toHaveLength(1);
    expect(listRes.body.items[0].id).toBe(itemId);
    // preview only ever contains non-sensitive fields
    expect(listRes.body.items[0].preview).toEqual([{ key: 'username', value: 'ayush@example.com' }]);
    expect(JSON.stringify(listRes.body)).not.toContain('S3cr3t!');

    const patchRes = await request(app)
      .patch(`/api/items/${itemId}`)
      .set(auth)
      .send({ title: 'Netflix (Family Plan)', tags: ['streaming', 'shared'] });
    expect(patchRes.status).toBe(200);
    expect(patchRes.body.title).toBe('Netflix (Family Plan)');
    expect(patchRes.body.tags).toEqual(['streaming', 'shared']);

    const delRes = await request(app).delete(`/api/items/${itemId}`).set(auth);
    expect(delRes.status).toBe(204);
    expect(await VaultItem.findById(itemId)).toBeNull();
  });

  it('rejects creating an item in a non-existent folder', async () => {
    const { family, auth } = await makeFamilyWithAdmin();
    const res = await request(app)
      .post('/api/items')
      .set(auth)
      .send({ title: 'Ghost', folderId: new mongoose.Types.ObjectId().toString(), kind: 'note' });
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('FOLDER_NOT_FOUND');
    void family;
  });

  it('filters by kind/folderId/tag and supports q text search', async () => {
    const { family, membership, auth } = await makeFamilyWithAdmin();
    const folderA = await makeFolder(family._id, membership._id, { name: 'Logins' });
    const folderB = await makeFolder(family._id, membership._id, { name: 'Numbers' });

    await request(app)
      .post('/api/items')
      .set(auth)
      .send({ title: 'Gmail', folderId: folderA._id.toString(), kind: 'login', tags: ['email'] });
    await request(app)
      .post('/api/items')
      .set(auth)
      .send({ title: 'Passport Number', folderId: folderB._id.toString(), kind: 'record', tags: ['travel'] });
    await request(app)
      .post('/api/items')
      .set(auth)
      .send({ title: 'Wifi note', folderId: folderA._id.toString(), kind: 'note' });

    const byKind = await request(app).get('/api/items').query({ kind: 'record' }).set(auth);
    expect(byKind.body.items.map((i) => i.title)).toEqual(['Passport Number']);

    const byFolder = await request(app).get('/api/items').query({ folderId: folderA._id.toString() }).set(auth);
    expect(byFolder.body.items.map((i) => i.title).sort()).toEqual(['Gmail', 'Wifi note']);

    const byTag = await request(app).get('/api/items').query({ tag: 'travel' }).set(auth);
    expect(byTag.body.items.map((i) => i.title)).toEqual(['Passport Number']);

    const search = await request(app).get('/api/items').query({ q: 'Passport' }).set(auth);
    expect(search.body.items.map((i) => i.title)).toContain('Passport Number');
  });
});

describe('items: sensitive field masking + reveal', () => {
  it('never returns plaintext in list/detail; reveal requires X-Reauth when required by family settings', async () => {
    const { family, membership, auth } = await makeFamilyWithAdmin({ requireReauthForSecrets: true });
    const folder = await makeFolder(family._id, membership._id);

    const createRes = await request(app)
      .post('/api/items')
      .set(auth)
      .send({
        title: 'Bank locker',
        folderId: folder._id.toString(),
        kind: 'record',
        fields: [{ key: 'PIN', value: 'LOCKER-88213345', type: 'text', sensitive: true }],
      });
    const itemId = createRes.body.id;
    const field = createRes.body.fields[0];

    const detailRes = await request(app).get(`/api/items/${itemId}`).set(auth);
    expect(JSON.stringify(detailRes.body)).not.toContain('LOCKER-88213345');

    const noReauthRes = await request(app).get(`/api/items/${itemId}/fields/${field.id}/reveal`).set(auth);
    expect(noReauthRes.status).toBe(401);
    expect(noReauthRes.body.code).toBe('REAUTH_REQUIRED');

    const reauthToken = signReauthToken({ membershipId: membership._id, familyId: family._id });
    const revealRes = await request(app)
      .get(`/api/items/${itemId}/fields/${field.id}/reveal`)
      .set(auth)
      .set('X-Reauth', reauthToken);
    expect(revealRes.status).toBe(200);
    expect(revealRes.body.value).toBe('LOCKER-88213345');

    const activityRes = await request(app).get(`/api/items/${itemId}/activity`).set(auth);
    expect(activityRes.body.items.map((a) => a.action)).toContain('field.reveal');
  });

  it('reveal skips the X-Reauth gate when Family.settings.requireReauthForSecrets is false', async () => {
    const { family, membership, auth } = await makeFamilyWithAdmin({ requireReauthForSecrets: false });
    const folder = await makeFolder(family._id, membership._id);

    const createRes = await request(app)
      .post('/api/items')
      .set(auth)
      .send({
        title: 'Note',
        folderId: folder._id.toString(),
        kind: 'note',
        fields: [{ key: 'note', value: 'The gate code is 1234', sensitive: true }],
      });
    const itemId = createRes.body.id;
    const field = createRes.body.fields[0];

    const revealRes = await request(app).get(`/api/items/${itemId}/fields/${field.id}/reveal`).set(auth);
    expect(revealRes.status).toBe(200);
    expect(revealRes.body.value).toBe('The gate code is 1234');
    void membership;
  });
});

describe('items: integration seam', () => {
  it('GET /browse includes items[] for the current folder', async () => {
    const { family, membership, auth } = await makeFamilyWithAdmin();
    const folder = await makeFolder(family._id, membership._id);
    await request(app)
      .post('/api/items')
      .set(auth)
      .send({ title: 'Wifi password', folderId: folder._id.toString(), kind: 'login' });

    const browseRes = await request(app).get('/api/folders/browse').query({ folderId: folder._id.toString() }).set(auth);
    expect(browseRes.status).toBe(200);
    expect(browseRes.body.items).toHaveLength(1);
    expect(browseRes.body.items[0].title).toBe('Wifi password');
  });

  it('GET /documents?q= merges matching items into itemResults', async () => {
    const { family, membership, auth } = await makeFamilyWithAdmin();
    const folder = await makeFolder(family._id, membership._id);
    await request(app)
      .post('/api/items')
      .set(auth)
      .send({ title: 'Unique-Wombat-Login', folderId: folder._id.toString(), kind: 'login' });

    const res = await request(app).get('/api/documents').query({ q: 'Unique-Wombat-Login' }).set(auth);
    expect(res.status).toBe(200);
    expect(res.body.itemResults.map((i) => i.title)).toContain('Unique-Wombat-Login');
  });

  it('GET /stats itemsByKind reflects created items', async () => {
    const { family, membership, auth } = await makeFamilyWithAdmin();
    const folder = await makeFolder(family._id, membership._id);
    await request(app).post('/api/items').set(auth).send({ title: 'A', folderId: folder._id.toString(), kind: 'login' });
    await request(app).post('/api/items').set(auth).send({ title: 'B', folderId: folder._id.toString(), kind: 'login' });
    await request(app).post('/api/items').set(auth).send({ title: 'C', folderId: folder._id.toString(), kind: 'note' });

    const res = await request(app).get('/api/stats').set(auth);
    expect(res.status).toBe(200);
    expect(res.body.itemsByKind).toEqual({ login: 2, record: 0, note: 1 });
  });

  it('deleting a folder recursively removes the items inside it', async () => {
    const { family, membership, auth } = await makeFamilyWithAdmin();
    const folder = await makeFolder(family._id, membership._id);
    const createRes = await request(app)
      .post('/api/items')
      .set(auth)
      .send({ title: 'Gone soon', folderId: folder._id.toString(), kind: 'note' });

    const del = await request(app).delete(`/api/folders/${folder._id}`).query({ confirm: 1 }).set(auth);
    expect(del.status).toBe(200);
    expect(await VaultItem.findById(createRes.body.id)).toBeNull();
  });

  it('shares support targetType "item" and enforce includeSensitive invariants', async () => {
    const { family, membership, auth } = await makeFamilyWithAdmin();
    const folder = await makeFolder(family._id, membership._id);
    const createRes = await request(app)
      .post('/api/items')
      .set(auth)
      .send({
        title: 'Router login',
        folderId: folder._id.toString(),
        kind: 'login',
        fields: [
          { key: 'username', value: 'admin', sensitive: false },
          { key: 'password', value: 'hunter2', sensitive: true },
        ],
      });
    const itemId = createRes.body.id;

    // includeSensitive:true without a password -> rejected before ever touching the item.
    const badShare = await request(app)
      .post('/api/shares')
      .set(auth)
      .send({ targetType: 'item', targetId: itemId, expiresIn: '1h', includeSensitive: true });
    expect(badShare.status).toBe(400);
    expect(badShare.body.code).toBe('INVALID_SENSITIVE_SHARE');

    const goodShare = await request(app)
      .post('/api/shares')
      .set(auth)
      .send({ targetType: 'item', targetId: itemId, expiresIn: '1h', includeSensitive: true, password: 'sharepw123' });
    expect(goodShare.status).toBe(201);
    expect(goodShare.body.targetLabel).toBe('Router login');

    const token = goodShare.body.url.split('/s/')[1];
    const publicRes = await request(app).get(`/api/public/shares/${token}`).set('X-Share-Password', 'sharepw123');
    expect(publicRes.status).toBe(200);
    expect(publicRes.body.targetType).toBe('item');
    expect(publicRes.body.item.title).toBe('Router login');
    const passwordField = publicRes.body.item.fields.find((f) => f.key === 'password');
    expect(passwordField.value).toBe('hunter2');

    await Share.deleteMany({});
    void membership;
  });
});
