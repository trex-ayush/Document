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
import { PlatformSettings } from '../src/models/PlatformSettings.js';
import sharp from 'sharp';
import { signAccessToken } from '../src/utils/tokens.js';

// A genuinely valid PNG, generated through the SAME sharp/libvips build the server uses (rather
// than a hand-copied "well-known tiny PNG" constant) — sharp 0.33's default PNG decoder (libspng)
// is strict and rejects some commonly-circulated minimal PNG fixtures that other decoders tolerate.
async function pngBuffer() {
  return sharp({ create: { width: 12, height: 8, channels: 3, background: { r: 200, g: 60, b: 60 } } })
    .png()
    .toBuffer();
}
function pdfBuffer() {
  return Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(256, 0x20), Buffer.from('\n%%EOF')]);
}
function garbageBuffer() {
  return Buffer.from('this is plainly not a real image or pdf, just text bytes here'.repeat(4), 'utf8');
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

async function makeFolder(familyId, membershipId, overrides = {}) {
  return Folder.create({ familyId, name: 'Test Folder', parentId: null, createdBy: membershipId, ...overrides });
}

describe('documents CRUD + upload validation', () => {
  it('creates a document with a PNG file and returns the safe serialized shape', async () => {
    const { family, membership, auth } = await makeFamilyWithAdmin();
    const folder = await makeFolder(family._id, membership._id);

    const res = await request(app)
      .post('/api/documents')
      .set(auth)
      .field('data', JSON.stringify({ title: 'Passport', folderId: String(folder._id) }))
      .field('labels', JSON.stringify(['Front page']))
      .attach('files', await pngBuffer(), { filename: 'passport.png', contentType: 'image/png' });

    expect(res.status).toBe(201);
    expect(res.body.title).toBe('Passport');
    expect(res.body.folderId).toBe(String(folder._id));
    expect(res.body.notes).toBe('');
    expect(res.body.createdBy).toBe(String(membership._id));
    expect(res.body.files).toHaveLength(1);

    const file = res.body.files[0];
    expect(file.label).toBe('Front page');
    expect(file.mimeType).toBe('image/png');
    expect(file.url).toMatch(/^\/api\/files\//);
    expect(file.thumbUrl).toMatch(/^\/api\/files\//);
    expect(file.downloadUrl).toMatch(/^\/api\/files\//);
    // never leak internal storage/encryption fields
    expect(file.storageKey).toBeUndefined();
    expect(file.thumbKey).toBeUndefined();
    expect(file.encryption).toBeUndefined();
    expect(file.thumbEncryption).toBeUndefined();
    expect(res.body.breadcrumbs).toHaveLength(1);
    // removed fields are gone from the shape
    for (const gone of ['typeId', 'memberId', 'tags', 'expiryDate', 'customFields']) {
      expect(res.body[gone]).toBeUndefined();
    }
  });

  it('lists documents directly in a folder, newest first, excluding the bin', async () => {
    const { family, membership, auth } = await makeFamilyWithAdmin();
    const folderA = await makeFolder(family._id, membership._id, { name: 'A' });
    const folderB = await makeFolder(family._id, membership._id, { name: 'B' });
    const base = { familyId: family._id, createdBy: membership._id };
    await Document.create({ ...base, folderId: folderA._id, title: 'In A' });
    await Document.create({ ...base, folderId: folderB._id, title: 'In B' });
    await Document.create({ ...base, folderId: folderA._id, title: 'Binned', deletedAt: new Date() });

    const inA = await request(app).get('/api/documents').query({ folderId: String(folderA._id) }).set(auth);
    expect(inA.status).toBe(200);
    expect(inA.body.items.map((d) => d.title)).toEqual(['In A']);
    expect(inA.body.total).toBe(1);

    const all = await request(app).get('/api/documents').set(auth);
    expect(all.body.total).toBe(2);
    // the old search integration is gone (search lives at /api/search now)
    expect(all.body.itemResults).toBeUndefined();

    const bad = await request(app).get('/api/documents').query({ folderId: 'nope' }).set(auth);
    expect(bad.status).toBe(400);
  });

  it('accepts the simple upload form (file + title + notes) and puts it in the Shared folder', async () => {
    const { family, auth } = await makeFamilyWithAdmin();

    const res = await request(app)
      .post('/api/documents')
      .set(auth)
      .field('data', JSON.stringify({ title: 'Electricity bill', notes: 'March — paid online' }))
      .attach('files', await pngBuffer(), { filename: 'electricity-bill.png', contentType: 'image/png' });
    expect(res.status).toBe(201);
    expect(res.body.notes).toBe('March — paid online');
    expect(res.body.files).toHaveLength(1);

    const shared = await Folder.findOne({ familyId: family._id, systemKey: 'shared' }).lean();
    expect(shared).toBeTruthy();
    expect(shared.isSystem).toBe(true);
    expect(res.body.folderId).toBe(String(shared._id));
    expect(res.body.breadcrumbs.map((b) => b.name)).toEqual(['Shared']);
    expect(res.body.breadcrumbs[0].isSystem).toBe(true);

    // null and 'root' also mean Shared — nothing is ever loose at the top level.
    for (const folderId of [null, 'root']) {
      // eslint-disable-next-line no-await-in-loop
      const r = await request(app)
        .post('/api/documents')
        .set(auth)
        .field('data', JSON.stringify({ title: 'Scan', folderId }))
        .attach('files', await pngBuffer(), { filename: 'scan.png', contentType: 'image/png' });
      expect(r.status).toBe(201);
      expect(r.body.folderId).toBe(String(shared._id));
      expect(r.body.notes).toBe('');
    }

    // Still exactly one Shared folder.
    expect(await Folder.countDocuments({ familyId: family._id, systemKey: 'shared' })).toBe(1);
  });

  it('rejects a folderId that does not exist in the family (404 FOLDER_NOT_FOUND)', async () => {
    const { auth } = await makeFamilyWithAdmin();
    const res = await request(app)
      .post('/api/documents')
      .set(auth)
      .field('data', JSON.stringify({ title: 'Ghost', folderId: '0123456789abcdef01234567' }))
      .attach('files', await pngBuffer(), { filename: 'g.png', contentType: 'image/png' });
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('FOLDER_NOT_FOUND');
  });

  it('rejects an upload with no magic-byte match (400 UNSUPPORTED_FILE_TYPE)', async () => {
    const { family, membership, auth } = await makeFamilyWithAdmin();
    const folder = await makeFolder(family._id, membership._id);

    const res = await request(app)
      .post('/api/documents')
      .set(auth)
      .field('data', JSON.stringify({ title: 'Bad file', folderId: String(folder._id) }))
      .field('labels', JSON.stringify(['x']))
      .attach('files', garbageBuffer(), { filename: 'not-a-real-file.png', contentType: 'image/png' });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('UNSUPPORTED_FILE_TYPE');
  });

  it('rejects a file with mismatched extension via magic-byte sniff (a PDF renamed to .png)', async () => {
    const { family, membership, auth } = await makeFamilyWithAdmin();
    const folder = await makeFolder(family._id, membership._id);

    // Claims to be image/png in headers/filename, but the bytes are a PDF — the allowed set does
    // include pdf, so this should actually succeed (proves detection ignores the client's claim
    // and uses real content), while the mimeType stored is application/pdf, not image/png.
    const res = await request(app)
      .post('/api/documents')
      .set(auth)
      .field('data', JSON.stringify({ title: 'Mislabeled', folderId: String(folder._id) }))
      .field('labels', JSON.stringify(['x']))
      .attach('files', pdfBuffer(), { filename: 'fake.png', contentType: 'image/png' });

    expect(res.status).toBe(201);
    expect(res.body.files[0].mimeType).toBe('application/pdf');
    expect(res.body.files[0].thumbUrl).toBeNull(); // no thumbnail for PDFs
  });

  it('rejects an oversized upload (413 FILE_TOO_LARGE)', async () => {
    const { family, membership, auth } = await makeFamilyWithAdmin();
    const folder = await makeFolder(family._id, membership._id);

    // Build something just over whatever MAX_FILE_MB this environment's .env actually sets
    // (never hardcode a specific value), with a valid PDF header so we know it's the SIZE check
    // (not the type check) rejecting it.
    const maxFileMB = Number(process.env.MAX_FILE_MB) || 20;
    const big = Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(maxFileMB * 1024 * 1024 + 1024, 0x20)]);

    const res = await request(app)
      .post('/api/documents')
      .set(auth)
      .field('data', JSON.stringify({ title: 'Huge', folderId: String(folder._id) }))
      .field('labels', JSON.stringify(['x']))
      .attach('files', big, { filename: 'huge.pdf', contentType: 'application/pdf' });

    expect(res.status).toBe(413);
    expect(res.body.code).toBe('FILE_TOO_LARGE');
  }, 30000);

  describe('max file size is the platform admin setting (never per-family)', () => {
    const twoMbPdf = () => Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(2 * 1024 * 1024, 0x20), Buffer.from('\n%%EOF')]);
    // Simulates a family saved before maxFileMB became platform-only (raw write, bypasses schema).
    const storeLegacyFamilyMaxFileMB = (familyId, value) =>
      Family.collection.updateOne({ _id: familyId }, { $set: { 'settings.maxFileMB': value } });
    const upload = (auth, folder) =>
      request(app)
        .post('/api/documents')
        .set(auth)
        .field('data', JSON.stringify({ title: 'Two MB', folderId: String(folder._id) }))
        .field('labels', JSON.stringify(['x']))
        .attach('files', twoMbPdf(), { filename: 'two.pdf', contentType: 'application/pdf' });

    it('rejects a file over the platform maxFileMB (413, message names the platform limit)', async () => {
      const { family, membership, auth } = await makeFamilyWithAdmin();
      const folder = await makeFolder(family._id, membership._id);
      await PlatformSettings.findByIdAndUpdate('platform', { maxFileMB: 1 }, { upsert: true });

      const res = await upload(auth, folder);
      expect(res.status).toBe(413);
      expect(res.body.code).toBe('FILE_TOO_LARGE');
      expect(res.body.message).toContain('1MB');
    }, 30000);

    it('ignores a stale, higher per-family maxFileMB still stored in the DB', async () => {
      const { family, membership, auth } = await makeFamilyWithAdmin();
      const folder = await makeFolder(family._id, membership._id);
      await PlatformSettings.findByIdAndUpdate('platform', { maxFileMB: 1 }, { upsert: true });
      await storeLegacyFamilyMaxFileMB(family._id, 200);

      const res = await upload(auth, folder);
      expect(res.status).toBe(413);
    }, 30000);

    it('ignores a stale, lower per-family maxFileMB (platform unset -> env default applies)', async () => {
      const { family, membership, auth } = await makeFamilyWithAdmin();
      const folder = await makeFolder(family._id, membership._id);
      await storeLegacyFamilyMaxFileMB(family._id, 1);

      const res = await upload(auth, folder);
      expect(res.status).toBe(201);
    }, 30000);
  });

  it('requires at least one file on create', async () => {
    const { family, membership, auth } = await makeFamilyWithAdmin();
    const folder = await makeFolder(family._id, membership._id);

    const res = await request(app)
      .post('/api/documents')
      .set(auth)
      .field('data', JSON.stringify({ title: 'No files', folderId: String(folder._id) }));

    expect(res.status).toBe(400);
  });

  it('full CRUD lifecycle: create, list, patch, add/delete file, delete document', async () => {
    const { family, membership, auth } = await makeFamilyWithAdmin();
    const folder = await makeFolder(family._id, membership._id);
    const other = await makeFolder(family._id, membership._id, { name: 'Other' });

    const createRes = await request(app)
      .post('/api/documents')
      .set(auth)
      .field('data', JSON.stringify({ title: 'Lifecycle Doc', folderId: String(folder._id) }))
      .attach('files', await pngBuffer(), { filename: 'a.png', contentType: 'image/png' });
    expect(createRes.status).toBe(201);
    const docId = createRes.body.id;
    const fileId = createRes.body.files[0].id;

    const listRes = await request(app).get('/api/documents').set(auth);
    expect(listRes.status).toBe(200);
    expect(listRes.body.items.map((d) => d.id)).toContain(docId);
    expect(listRes.body.items[0].fileCount).toBeGreaterThanOrEqual(1);
    expect(listRes.body.items[0].primaryThumbUrl).toMatch(/^\/api\/files\//);
    expect(listRes.body.items[0].notes).toBeUndefined();

    const patchRes = await request(app)
      .patch(`/api/documents/${docId}`)
      .set(auth)
      .send({ title: 'Renamed Doc', notes: 'Kept in the blue file', folderId: String(other._id) });
    expect(patchRes.status).toBe(200);
    expect(patchRes.body.title).toBe('Renamed Doc');
    expect(patchRes.body.notes).toBe('Kept in the blue file');
    expect(patchRes.body.folderId).toBe(String(other._id));

    // Moving to null puts it back into Shared.
    const toShared = await request(app).patch(`/api/documents/${docId}`).set(auth).send({ folderId: null });
    expect(toShared.status).toBe(200);
    expect(toShared.body.breadcrumbs.map((b) => b.name)).toEqual(['Shared']);

    // You can't delete the only file — delete the document instead.
    const lastFile = await request(app).delete(`/api/documents/${docId}/files/${fileId}`).set(auth);
    expect(lastFile.status).toBe(400);
    expect(lastFile.body.code).toBe('LAST_FILE');

    const addFileRes = await request(app)
      .post(`/api/documents/${docId}/files`)
      .set(auth)
      .attach('files', pdfBuffer(), { filename: 'b.pdf', contentType: 'application/pdf' });
    expect(addFileRes.status).toBe(200);
    expect(addFileRes.body.files).toHaveLength(2);

    // Rename / replace / reorder of a single file no longer exist.
    const patchFile = await request(app).patch(`/api/documents/${docId}/files/${fileId}`).set(auth).send({ label: 'x' });
    expect(patchFile.status).toBe(404);
    const replaceFile = await request(app)
      .put(`/api/documents/${docId}/files/${fileId}`)
      .set(auth)
      .attach('file', pdfBuffer(), { filename: 'r.pdf', contentType: 'application/pdf' });
    expect(replaceFile.status).toBe(404);

    const deleteFileRes = await request(app).delete(`/api/documents/${docId}/files/${fileId}`).set(auth);
    expect(deleteFileRes.status).toBe(200);
    expect(deleteFileRes.body.files).toHaveLength(1);

    const deleteDocRes = await request(app).delete(`/api/documents/${docId}`).set(auth);
    expect(deleteDocRes.status).toBe(204);

    const getAfterDelete = await request(app).get(`/api/documents/${docId}`).set(auth);
    expect(getAfterDelete.status).toBe(404);
  }, 30000);
});

describe('encrypt -> store -> retrieve -> decrypt round trip', () => {
  it('the bytes served back through /api/files exactly match the original upload', async () => {
    const { family, membership, auth } = await makeFamilyWithAdmin();
    const folder = await makeFolder(family._id, membership._id);
    const original = await pngBuffer();

    const createRes = await request(app)
      .post('/api/documents')
      .set(auth)
      .field('data', JSON.stringify({ title: 'Round trip', folderId: String(folder._id) }))
      .field('labels', JSON.stringify(['x']))
      .attach('files', original, { filename: 'rt.png', contentType: 'image/png' });
    expect(createRes.status).toBe(201);

    const file = createRes.body.files[0];
    const viewRes = await request(app).get(file.url);
    expect(viewRes.status).toBe(200);
    expect(Buffer.compare(viewRes.body, original)).toBe(0);
    expect(viewRes.headers['x-content-type-options']).toBe('nosniff');

    const thumbRes = await request(app).get(file.thumbUrl);
    expect(thumbRes.status).toBe(200);
    expect(thumbRes.headers['content-type']).toBe('image/webp');
  });
});

describe('document notes are encrypted at rest', () => {
  it('stores ciphertext in the database and returns plain text to members (no re-auth)', async () => {
    const { family, membership, auth } = await makeFamilyWithAdmin();
    const folder = await makeFolder(family._id, membership._id);

    const createRes = await request(app)
      .post('/api/documents')
      .set(auth)
      .field('data', JSON.stringify({ title: 'Bank KYC', folderId: String(folder._id), notes: 'PAN ABCDE1234F' }))
      .attach('files', await pngBuffer(), { filename: 'x.png', contentType: 'image/png' });
    expect(createRes.status).toBe(201);
    expect(createRes.body.notes).toBe('PAN ABCDE1234F');

    const raw = await Document.collection.findOne({ _id: new mongoose.Types.ObjectId(createRes.body.id) });
    expect(raw.notes).toBeTruthy();
    expect(raw.notes).not.toContain('ABCDE1234F');

    const detail = await request(app).get(`/api/documents/${createRes.body.id}`).set(auth);
    expect(detail.status).toBe(200);
    expect(detail.body.notes).toBe('PAN ABCDE1234F');

    const patched = await request(app).patch(`/api/documents/${createRes.body.id}`).set(auth).send({ notes: 'Updated 1234' });
    expect(patched.body.notes).toBe('Updated 1234');
    const rawAfter = await Document.collection.findOne({ _id: new mongoose.Types.ObjectId(createRes.body.id) });
    expect(rawAfter.notes).not.toContain('Updated');

    // The old per-field reveal endpoint is gone.
    const reveal = await request(app)
      .get(`/api/documents/${createRes.body.id}/fields/0123456789abcdef01234567/reveal`)
      .set(auth);
    expect(reveal.status).toBe(404);
  });
});

describe('Family.storageBytes running counter', () => {
  it('increments on upload, drops on per-file delete, unaffected by a soft document delete', async () => {
    const { family, membership, auth } = await makeFamilyWithAdmin();
    const folder = await makeFolder(family._id, membership._id);

    const startFamily = await Family.findById(family._id).lean();
    expect(startFamily.storageBytes).toBe(0);

    const createRes = await request(app)
      .post('/api/documents')
      .set(auth)
      .field('data', JSON.stringify({ title: 'Storage tracked', folderId: String(folder._id) }))
      .field('labels', JSON.stringify(['x']))
      .attach('files', await pngBuffer(), { filename: 'x.png', contentType: 'image/png' });
    const docId = createRes.body.id;
    const fileId = createRes.body.files[0].id;

    const afterCreate = await Family.findById(family._id).lean();
    expect(afterCreate.storageBytes).toBeGreaterThan(0);

    const addRes = await request(app)
      .post(`/api/documents/${docId}/files`)
      .set(auth)
      .field('labels', JSON.stringify(['y']))
      .attach('files', await pngBuffer(), { filename: 'y.png', contentType: 'image/png' });
    expect(addRes.status).toBe(200);
    const afterAdd = await Family.findById(family._id).lean();
    expect(afterAdd.storageBytes).toBeGreaterThan(afterCreate.storageBytes);

    await request(app)
      .delete(`/api/documents/${docId}/files/${fileId}`)
      .set(auth);
    const afterFileDelete = await Family.findById(family._id).lean();
    expect(afterFileDelete.storageBytes).toBeLessThan(afterAdd.storageBytes);

    // A whole-document delete is a SOFT delete (docs/DECISIONS.md "Soft delete / recycle bin") —
    // the file bytes are still physically stored (still counted against the family's quota) until
    // a platform admin permanently purges the document from the bin, so storageBytes must NOT
    // change here.
    await request(app).delete(`/api/documents/${docId}`).set(auth);
    const afterDocDelete = await Family.findById(family._id).lean();
    expect(afterDocDelete.storageBytes).toBe(afterFileDelete.storageBytes);

    const getAfterDelete = await request(app).get(`/api/documents/${docId}`).set(auth);
    expect(getAfterDelete.status).toBe(404);
  }, 30000);
});
