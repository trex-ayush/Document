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
import { signAccessToken } from '../src/utils/tokens.js';

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
  const token = signAccessToken({ userId: user._id });
  return {
    family,
    user,
    membership,
    token,
    auth: { Authorization: `Bearer ${token}`, 'X-Family-Id': String(family._id) },
  };
}

async function makeFolder(familyId, membershipId, overrides = {}) {
  return Folder.create({ familyId, name: 'Passwords & Logins', parentId: null, createdBy: membershipId, ...overrides });
}

const rawItem = (id) => VaultItem.collection.findOne({ _id: new mongoose.Types.ObjectId(id) });

describe('items: passwords', () => {
  it('creates, reads, lists, updates and deletes a password item', async () => {
    const { family, membership, auth } = await makeFamilyWithAdmin();
    const folder = await makeFolder(family._id, membership._id);

    const createRes = await request(app)
      .post('/api/items')
      .set(auth)
      .send({
        kind: 'login',
        title: 'Netflix',
        folderId: String(folder._id),
        username: 'papa@example.com',
        password: 'hunter2-secret',
        fields: [{ key: 'PIN', value: '4321' }],
        notes: 'Family plan',
      });
    expect(createRes.status).toBe(201);
    expect(createRes.body).toMatchObject({
      kind: 'login',
      title: 'Netflix',
      folderId: String(folder._id),
      username: 'papa@example.com',
      password: 'hunter2-secret',
      hasPassword: true,
      fields: [{ key: 'PIN', value: '4321' }],
      notes: 'Family plan',
    });
    expect(createRes.body.breadcrumbs.map((b) => b.name)).toEqual(['Passwords & Logins']);
    for (const gone of ['tags', 'memberId', 'fieldCount', 'preview']) {
      expect(createRes.body[gone]).toBeUndefined();
    }
    const id = createRes.body.id;

    // GET returns the plain-text password straight away — no re-auth.
    const getRes = await request(app).get(`/api/items/${id}`).set(auth);
    expect(getRes.status).toBe(200);
    expect(getRes.body.password).toBe('hunter2-secret');

    // Lists never include the password, only hasPassword.
    const listRes = await request(app).get('/api/items').set(auth);
    expect(listRes.status).toBe(200);
    expect(listRes.body.total).toBe(1);
    expect(listRes.body.items[0].password).toBeUndefined();
    expect(listRes.body.items[0].hasPassword).toBe(true);
    expect(listRes.body.items[0].username).toBe('papa@example.com');
    expect(JSON.stringify(listRes.body)).not.toContain('hunter2-secret');

    const patchRes = await request(app)
      .patch(`/api/items/${id}`)
      .set(auth)
      .send({ title: 'Netflix (TV)', password: 'new-pass-99', fields: [{ key: 'Profile', value: 'Kids' }] });
    expect(patchRes.status).toBe(200);
    expect(patchRes.body).toMatchObject({
      title: 'Netflix (TV)',
      password: 'new-pass-99',
      username: 'papa@example.com',
      fields: [{ key: 'Profile', value: 'Kids' }],
      notes: 'Family plan',
    });

    const delRes = await request(app).delete(`/api/items/${id}`).set(auth);
    expect(delRes.status).toBe(204);
    const afterDel = await request(app).get(`/api/items/${id}`).set(auth);
    expect(afterDel.status).toBe(404);
  });

  it('encrypts username, password, field values and notes at rest', async () => {
    const { auth } = await makeFamilyWithAdmin();
    const res = await request(app)
      .post('/api/items')
      .set(auth)
      .send({
        kind: 'login',
        title: 'Bank',
        username: 'user-SECRET-1',
        password: 'pass-SECRET-2',
        fields: [{ key: 'Customer ID', value: 'field-SECRET-3' }],
        notes: 'notes-SECRET-4',
      });
    expect(res.status).toBe(201);

    const raw = await rawItem(res.body.id);
    const stored = JSON.stringify(raw);
    for (const secret of ['user-SECRET-1', 'pass-SECRET-2', 'field-SECRET-3', 'notes-SECRET-4']) {
      expect(stored).not.toContain(secret);
    }
    expect(raw.title).toBe('Bank');
    expect(raw.fields[0].key).toBe('Customer ID');
  });

  it('a password with no password value reports hasPassword: false', async () => {
    const { auth } = await makeFamilyWithAdmin();
    const res = await request(app).post('/api/items').set(auth).send({ kind: 'login', title: 'Just a username', username: 'me' });
    expect(res.status).toBe(201);
    expect(res.body.hasPassword).toBe(false);
    expect(res.body.password).toBe('');
  });

  it('rejects the removed "record" kind and a missing title', async () => {
    const { auth } = await makeFamilyWithAdmin();
    const record = await request(app).post('/api/items').set(auth).send({ kind: 'record', title: 'PAN' });
    expect(record.status).toBe(400);
    const noTitle = await request(app).post('/api/items').set(auth).send({ kind: 'note', notes: 'x' });
    expect(noTitle.status).toBe(400);
  });

  it('the old per-field reveal endpoint is gone', async () => {
    const { auth } = await makeFamilyWithAdmin();
    const res = await request(app).post('/api/items').set(auth).send({ kind: 'login', title: 'Wifi', password: 'x' });
    const reveal = await request(app)
      .get(`/api/items/${res.body.id}/fields/0123456789abcdef01234567/reveal`)
      .set(auth);
    expect(reveal.status).toBe(404);
  });
});

describe('items: notes', () => {
  it('a note is just a title and notes — login-only values are dropped', async () => {
    const { auth } = await makeFamilyWithAdmin();
    const res = await request(app)
      .post('/api/items')
      .set(auth)
      .send({ kind: 'note', title: 'Locker', notes: 'Key is in the kitchen drawer', username: 'ignored', password: 'ignored', fields: [{ key: 'a', value: 'b' }] });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      kind: 'note',
      title: 'Locker',
      notes: 'Key is in the kitchen drawer',
      username: '',
      password: '',
      hasPassword: false,
      fields: [],
    });

    // Turning a password into a note clears its login values.
    const login = await request(app)
      .post('/api/items')
      .set(auth)
      .send({ kind: 'login', title: 'Old', username: 'u', password: 'p', fields: [{ key: 'k', value: 'v' }] });
    const toNote = await request(app).patch(`/api/items/${login.body.id}`).set(auth).send({ kind: 'note' });
    expect(toNote.status).toBe(200);
    expect(toNote.body).toMatchObject({ kind: 'note', username: '', password: '', fields: [] });
  });
});

describe('items: folders', () => {
  it('goes into the Shared folder when no folder is given', async () => {
    const { family, auth } = await makeFamilyWithAdmin();
    const res = await request(app).post('/api/items').set(auth).send({ kind: 'note', title: 'Anywhere' });
    expect(res.status).toBe(201);
    const shared = await Folder.findOne({ familyId: family._id, systemKey: 'shared' }).lean();
    expect(res.body.folderId).toBe(String(shared._id));

    // null / 'root' on PATCH also means Shared.
    const folder = await makeFolder(family._id, (await Membership.findOne({ familyId: family._id }))._id);
    const moved = await request(app).patch(`/api/items/${res.body.id}`).set(auth).send({ folderId: String(folder._id) });
    expect(moved.body.folderId).toBe(String(folder._id));
    const back = await request(app).patch(`/api/items/${res.body.id}`).set(auth).send({ folderId: 'root' });
    expect(back.body.folderId).toBe(String(shared._id));
  });

  it('rejects creating an item in a non-existent folder', async () => {
    const { auth } = await makeFamilyWithAdmin();
    const res = await request(app)
      .post('/api/items')
      .set(auth)
      .send({ title: 'Ghost', folderId: '0123456789abcdef01234567', kind: 'note' });
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('FOLDER_NOT_FOUND');
  });

  it('filters the list by kind and folderId', async () => {
    const { family, membership, auth } = await makeFamilyWithAdmin();
    const folderA = await makeFolder(family._id, membership._id, { name: 'A' });
    const folderB = await makeFolder(family._id, membership._id, { name: 'B' });
    await request(app).post('/api/items').set(auth).send({ title: 'Login A', folderId: String(folderA._id), kind: 'login' });
    await request(app).post('/api/items').set(auth).send({ title: 'Note A', folderId: String(folderA._id), kind: 'note' });
    await request(app).post('/api/items').set(auth).send({ title: 'Login B', folderId: String(folderB._id), kind: 'login' });

    const logins = await request(app).get('/api/items').query({ kind: 'login' }).set(auth);
    expect(logins.body.items.map((i) => i.title).sort()).toEqual(['Login A', 'Login B']);

    const inA = await request(app).get('/api/items').query({ folderId: String(folderA._id) }).set(auth);
    expect(inA.body.items.map((i) => i.title).sort()).toEqual(['Login A', 'Note A']);

    const both = await request(app).get('/api/items').query({ folderId: String(folderA._id), kind: 'note' }).set(auth);
    expect(both.body.items.map((i) => i.title)).toEqual(['Note A']);
  });

  it('GET /folders/browse includes the folder items (without passwords)', async () => {
    const { family, membership, auth } = await makeFamilyWithAdmin();
    const folder = await makeFolder(family._id, membership._id);
    await request(app)
      .post('/api/items')
      .set(auth)
      .send({ title: 'Wifi password', folderId: String(folder._id), kind: 'login', password: 'wifi-secret' });

    const browseRes = await request(app).get('/api/folders/browse').query({ folderId: String(folder._id) }).set(auth);
    expect(browseRes.status).toBe(200);
    expect(browseRes.body.items).toHaveLength(1);
    expect(browseRes.body.items[0].title).toBe('Wifi password');
    expect(browseRes.body.items[0].hasPassword).toBe(true);
    expect(JSON.stringify(browseRes.body)).not.toContain('wifi-secret');
  });

  it('deleting a folder moves the items inside it into the bin', async () => {
    const { family, membership, auth } = await makeFamilyWithAdmin();
    const folder = await makeFolder(family._id, membership._id);
    const createRes = await request(app)
      .post('/api/items')
      .set(auth)
      .send({ title: 'Gone soon', folderId: String(folder._id), kind: 'note' });

    const del = await request(app).delete(`/api/folders/${folder._id}`).query({ confirm: 1 }).set(auth);
    expect(del.status).toBe(200);
    expect(await VaultItem.findById(createRes.body.id)).toBeNull();
    const raw = await rawItem(createRes.body.id);
    expect(raw.deletedAt).toBeTruthy();
  });
});

describe('items: who added and changed it', () => {
  it('GET /items/:id names the member who added it and who last changed it', async () => {
    const { family, membership, auth } = await makeFamilyWithAdmin();
    const other = await Membership.create({ familyId: family._id, name: 'Priya', role: 'member', access: 'write', status: 'active' });
    const createRes = await request(app).post('/api/items').set(auth).send({ kind: 'note', title: 'Gas agency', notes: 'Book on the 1st' });
    expect(createRes.status).toBe(201);
    const id = createRes.body.id;

    const first = await request(app).get(`/api/items/${id}`).set(auth);
    expect(first.body.createdByName).toBe('Admin User');
    expect(first.body.updatedByName).toBeNull();

    await VaultItem.updateOne({ _id: id }, { $set: { updatedBy: other._id } });
    const second = await request(app).get(`/api/items/${id}`).set(auth);
    expect(second.body.createdByName).toBe('Admin User');
    expect(second.body.updatedByName).toBe('Priya');
    expect(String(membership._id)).not.toBe(String(other._id));
  });

  it('never resolves a name from another family', async () => {
    const a = await makeFamilyWithAdmin();
    const b = await makeFamilyWithAdmin();
    const createRes = await request(app).post('/api/items').set(a.auth).send({ kind: 'note', title: 'Milk', notes: '' });
    await VaultItem.updateOne({ _id: createRes.body.id }, { $set: { updatedBy: b.membership._id } });
    const res = await request(app).get(`/api/items/${createRes.body.id}`).set(a.auth);
    expect(res.body.updatedByName).toBeNull();
  });
});

describe('items: "Keep secret" extra fields', () => {
  it('create and patch return `secret` for each field', async () => {
    const { auth } = await makeFamilyWithAdmin();
    const res = await request(app)
      .post('/api/items')
      .set(auth)
      .send({
        kind: 'login',
        title: 'SBI',
        fields: [
          { key: 'Locker code', value: '8080', secret: true },
          { key: 'Branch', value: 'Civil Lines', secret: false },
        ],
      });
    expect(res.status).toBe(201);
    expect(res.body.fields).toEqual([
      { key: 'Locker code', value: '8080', secret: true },
      { key: 'Branch', value: 'Civil Lines', secret: false },
    ]);

    const patch = await request(app)
      .patch(`/api/items/${res.body.id}`)
      .set(auth)
      .send({ fields: [{ key: 'Branch', value: 'Civil Lines', secret: true }] });
    expect(patch.status).toBe(200);
    expect(patch.body.fields).toEqual([{ key: 'Branch', value: 'Civil Lines', secret: true }]);

    const get = await request(app).get(`/api/items/${res.body.id}`).set(auth);
    expect(get.body.fields).toEqual([{ key: 'Branch', value: 'Civil Lines', secret: true }]);
  });

  it('defaults `secret` from the field name when it is omitted — and an explicit false wins', async () => {
    const { auth } = await makeFamilyWithAdmin();
    const res = await request(app)
      .post('/api/items')
      .set(auth)
      .send({
        kind: 'login',
        title: 'Bank',
        fields: [
          { key: 'ATM PIN', value: '4321' },
          { key: 'UPI pin', value: '9999' },
          { key: 'Website', value: 'sbi.co.in' },
          { key: 'MPIN', value: '1111', secret: false },
        ],
      });
    expect(res.status).toBe(201);
    expect(res.body.fields.map((f) => [f.key, f.secret])).toEqual([
      ['ATM PIN', true],
      ['UPI pin', true],
      ['Website', false],
      ['MPIN', false],
    ]);
  });

  it('keeps a secret field value encrypted at rest', async () => {
    const { auth } = await makeFamilyWithAdmin();
    const res = await request(app)
      .post('/api/items')
      .set(auth)
      .send({ kind: 'login', title: 'Card', fields: [{ key: 'CVV', value: 'cvv-SECRET-731', secret: true }] });
    const raw = await rawItem(res.body.id);
    expect(raw.fields[0].secret).toBe(true);
    expect(raw.fields[0].value).not.toBe('cvv-SECRET-731');
    expect(JSON.stringify(raw)).not.toContain('cvv-SECRET-731');
  });

  it('a field saved before the flag existed is secret when its name looks sensitive', async () => {
    const { auth } = await makeFamilyWithAdmin();
    const res = await request(app)
      .post('/api/items')
      .set(auth)
      .send({ kind: 'login', title: 'Old bank', fields: [{ key: 'ATM PIN', value: '4321' }, { key: 'Website', value: 'x.in' }] });
    // Simulate an old row: no `secret` stored at all.
    await VaultItem.collection.updateOne(
      { _id: new mongoose.Types.ObjectId(res.body.id) },
      { $unset: { 'fields.0.secret': '', 'fields.1.secret': '' } },
    );
    const raw = await rawItem(res.body.id);
    expect(raw.fields[0]).not.toHaveProperty('secret');

    const get = await request(app).get(`/api/items/${res.body.id}`).set(auth);
    expect(get.body.fields.map((f) => [f.key, f.secret])).toEqual([['ATM PIN', true], ['Website', false]]);

    const list = await request(app).get('/api/items').set(auth);
    expect(list.body.items[0].fields.map((f) => f.secret)).toEqual([true, false]);

    // Editing something else keeps it that way.
    const patch = await request(app).patch(`/api/items/${res.body.id}`).set(auth).send({ title: 'Old bank (renamed)' });
    expect(patch.body.fields.map((f) => [f.key, f.secret])).toEqual([['ATM PIN', true], ['Website', false]]);
    const again = await request(app).get(`/api/items/${res.body.id}`).set(auth);
    expect(again.body.fields.map((f) => [f.key, f.secret])).toEqual([['ATM PIN', true], ['Website', false]]);
  });

  it('item lists and folder browse never carry a secret field value — only the item page does', async () => {
    const { auth } = await makeFamilyWithAdmin();
    const res = await request(app)
      .post('/api/items')
      .set(auth)
      .send({ kind: 'login', title: 'SBI', fields: [{ key: 'ATM PIN', value: '4321' }, { key: 'Branch', value: 'Civil Lines' }] });
    expect(res.status).toBe(201);

    const list = await request(app).get('/api/items').set(auth);
    const listed = list.body.items.find((i) => i.id === res.body.id);
    expect(listed.fields).toEqual([
      { key: 'ATM PIN', value: '', secret: true },
      { key: 'Branch', value: 'Civil Lines', secret: false },
    ]);
    expect(JSON.stringify(list.body)).not.toContain('4321');

    const browse = await request(app).get(`/api/folders/browse?folderId=${res.body.folderId}`).set(auth);
    expect(JSON.stringify(browse.body)).not.toContain('4321');

    const detail = await request(app).get(`/api/items/${res.body.id}`).set(auth);
    expect(detail.body.fields[0]).toEqual({ key: 'ATM PIN', value: '4321', secret: true });
  });

  it('rejects a non-boolean `secret`', async () => {
    const { auth } = await makeFamilyWithAdmin();
    const res = await request(app)
      .post('/api/items')
      .set(auth)
      .send({ kind: 'login', title: 'X', fields: [{ key: 'PIN', value: '1', secret: 'yes' }] });
    expect(res.status).toBe(400);
  });
});
