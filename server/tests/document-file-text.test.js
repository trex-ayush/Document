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
import { VaultItem } from '../src/models/VaultItem.js';
import { signAccessToken } from '../src/utils/tokens.js';

// The text the app reads from each file (docs/API.md "POST /documents" `texts`): encrypted at
// rest per file, only in the document detail, searchable, gone with a binned file.

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
  return { family, user, membership, auth: { Authorization: `Bearer ${token}`, 'X-Family-Id': String(family._id) } };
}

const rawDoc = (id) => Document.collection.findOne({ _id: new mongoose.Types.ObjectId(id) });

async function createWithTexts(auth, texts, title = 'Aadhaar card') {
  const req = request(app).post('/api/documents').set(auth).field('data', JSON.stringify({ title }));
  const png = await pngBuffer();
  texts.forEach((_, i) => req.attach('files', png, { filename: `page-${i + 1}.png`, contentType: 'image/png' }));
  return req.field('texts', JSON.stringify(texts));
}

describe('text read from each file', () => {
  it('is stored encrypted per file and returned in the document detail', async () => {
    const { auth } = await makeFamilyWithAdmin();
    const res = await createWithTexts(auth, ['  GOVERNMENT OF INDIA\nRamesh Kumar  ', null]);
    expect(res.status).toBe(201);
    expect(res.body.files.map((f) => f.text)).toEqual(['GOVERNMENT OF INDIA\nRamesh Kumar', '']);

    const raw = await rawDoc(res.body.id);
    expect(raw.files[0].textEncrypted).toBeTruthy();
    expect(raw.files[0].textEncrypted).not.toContain('Ramesh');
    expect(raw.files[1].textEncrypted).toBe('');

    const detail = await request(app).get(`/api/documents/${res.body.id}`).set(auth);
    expect(detail.body.files[0].text).toBe('GOVERNMENT OF INDIA\nRamesh Kumar');
  });

  it('works without texts (older apps) and rejects a texts list of the wrong length', async () => {
    const { auth } = await makeFamilyWithAdmin();
    const plain = await request(app)
      .post('/api/documents')
      .set(auth)
      .field('data', JSON.stringify({ title: 'Bill' }))
      .attach('files', await pngBuffer(), { filename: 'bill.png', contentType: 'image/png' });
    expect(plain.status).toBe(201);
    expect(plain.body.files[0].text).toBe('');

    const bad = await request(app)
      .post('/api/documents')
      .set(auth)
      .field('data', JSON.stringify({ title: 'Bill' }))
      .attach('files', await pngBuffer(), { filename: 'bill.png', contentType: 'image/png' })
      .field('texts', JSON.stringify(['a', 'b']));
    expect(bad.status).toBe(400);
  });

  it('cuts very long text to 20 000 characters', async () => {
    const { auth } = await makeFamilyWithAdmin();
    const res = await createWithTexts(auth, ['x'.repeat(25000)]);
    expect(res.status).toBe(201);
    expect(res.body.files[0].text).toHaveLength(20000);
  });

  it('files added later carry their own text', async () => {
    const { auth } = await makeFamilyWithAdmin();
    const created = await createWithTexts(auth, ['front side words']);
    const added = await request(app)
      .post(`/api/documents/${created.body.id}/files`)
      .set(auth)
      .attach('files', await pngBuffer(), { filename: 'back.png', contentType: 'image/png' })
      .field('texts', JSON.stringify(['back side words']));
    expect(added.status).toBe(200);
    expect(added.body.files.map((f) => f.text)).toEqual(['front side words', 'back side words']);
  });

  it('PATCH /documents/:id/files/:fileId/text changes or clears one file text (write access only)', async () => {
    const { family, auth } = await makeFamilyWithAdmin();
    const created = await createWithTexts(auth, ['old text', 'other file']);
    const [first, second] = created.body.files;
    const url = (fileId) => `/api/documents/${created.body.id}/files/${fileId}/text`;

    const patched = await request(app).patch(url(first.id)).set(auth).send({ text: ' fixed text ' });
    expect(patched.status).toBe(200);
    expect(patched.body.files.map((f) => f.text)).toEqual(['fixed text', 'other file']);

    const cleared = await request(app).patch(url(second.id)).set(auth).send({ text: null });
    expect(cleared.status).toBe(200);
    expect(cleared.body.files[1].text).toBe('');

    const uniq = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const reader = await User.create({ name: 'Reader', email: `reader-${uniq}@test.com`, passwordHash: 'x', googleId: `ng-${uniq}` });
    await Membership.create({ familyId: family._id, userId: reader._id, name: 'Reader', role: 'member', access: 'read', status: 'active' });
    const readerAuth = { Authorization: `Bearer ${signAccessToken({ userId: reader._id })}`, 'X-Family-Id': String(family._id) };
    expect((await request(app).patch(url(first.id)).set(readerAuth).send({ text: 'x' })).status).toBe(403);

    expect((await request(app).patch(url(new mongoose.Types.ObjectId())).set(auth).send({ text: 'x' })).status).toBe(404);
  });

  it('is never in document lists, folder browsing or public share pages', async () => {
    const { family, membership, auth } = await makeFamilyWithAdmin();
    const folder = await Folder.create({ familyId: family._id, name: 'Papa', parentId: null, createdBy: membership._id });
    const created = await request(app)
      .post('/api/documents')
      .set(auth)
      .field('data', JSON.stringify({ title: 'PAN card', folderId: String(folder._id) }))
      .attach('files', await pngBuffer(), { filename: 'pan.png', contentType: 'image/png' })
      .field('texts', JSON.stringify(['SECRETWORDFROMPHOTO']));
    expect(created.status).toBe(201);

    const list = await request(app).get(`/api/documents?folderId=${folder._id}`).set(auth);
    expect(list.status).toBe(200);
    expect(list.body.items).toHaveLength(1);
    expect(JSON.stringify(list.body)).not.toContain('SECRETWORDFROMPHOTO');

    const browse = await request(app).get(`/api/folders/browse?folderId=${folder._id}`).set(auth);
    expect(browse.status).toBe(200);
    expect(JSON.stringify(browse.body)).not.toContain('SECRETWORDFROMPHOTO');

    const share = await request(app).post('/api/shares').set(auth).send({ targetType: 'document', targetId: created.body.id, duration: '24h' });
    expect(share.status).toBe(201);
    const token = share.body.url.split('/s/')[1];
    const pub = await request(app).get(`/api/public/shares/${token}`);
    expect(pub.status).toBe(200);
    expect(JSON.stringify(pub.body)).not.toContain('SECRETWORDFROMPHOTO');
    expect(pub.body.document.files[0]).not.toHaveProperty('text');
  });

  it('search finds words from a file text, names the file, and skips files in the Bin', async () => {
    const { auth } = await makeFamilyWithAdmin();
    const created = await createWithTexts(auth, ['nothing special here', 'Permanent Account Number ABCDE1234F'], 'Papa PAN');
    const [, second] = created.body.files;

    const hit = await request(app).get('/api/search?q=abcde1234f').set(auth);
    expect(hit.status).toBe(200);
    expect(hit.body.documents).toHaveLength(1);
    expect(hit.body.documents[0].snippet).toMatch(/^page-2\.png: .*ABCDE1234F/);

    // A saved password is still never searched.
    await request(app).post('/api/items').set(auth).send({ kind: 'login', title: 'Bank', password: 'abcde1234f' }).expect(201);
    const again = await request(app).get('/api/search?q=abcde1234f').set(auth);
    expect(again.body.items).toHaveLength(0);

    await request(app).delete(`/api/documents/${created.body.id}/files/${second.id}`).set(auth).expect(200);
    const afterBin = await request(app).get('/api/search?q=abcde1234f').set(auth);
    expect(afterBin.body.documents).toHaveLength(0);
    const detail = await request(app).get(`/api/documents/${created.body.id}`).set(auth);
    expect(JSON.stringify(detail.body)).not.toContain('ABCDE1234F');
  });

  it('another family can neither read, change nor find a file text', async () => {
    const a = await makeFamilyWithAdmin();
    const b = await makeFamilyWithAdmin();
    const created = await createWithTexts(a.auth, ['FAMILYAONLYWORDS']);
    const fileId = created.body.files[0].id;

    expect((await request(app).get(`/api/documents/${created.body.id}`).set(b.auth)).status).toBe(404);
    const hijack = await request(app).patch(`/api/documents/${created.body.id}/files/${fileId}/text`).set(b.auth).send({ text: 'hijack' });
    expect(hijack.status).toBe(404);
    const search = await request(app).get('/api/search?q=familyaonlywords').set(b.auth);
    expect(search.body.documents).toHaveLength(0);
    const own = await request(app).get(`/api/documents/${created.body.id}`).set(a.auth);
    expect(own.body.files[0].text).toBe('FAMILYAONLYWORDS');
  });
});
