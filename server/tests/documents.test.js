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
import sharp from 'sharp';
import { signAccessToken, signReauthToken } from '../src/utils/tokens.js';

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
      .field('data', JSON.stringify({ title: 'Passport', folderId: String(folder._id), tags: ['id', 'travel'] }))
      .field('labels', JSON.stringify(['Front page']))
      .attach('files', await pngBuffer(), { filename: 'passport.png', contentType: 'image/png' });

    expect(res.status).toBe(201);
    expect(res.body.title).toBe('Passport');
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
    // (never hardcode a specific value — a local .env legitimately differing from .env.example's
    // example value isn't a bug), with a valid PDF header so we know it's the SIZE check (not the
    // type check) rejecting it.
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

  it('requires at least one file on create', async () => {
    const { family, membership, auth } = await makeFamilyWithAdmin();
    const folder = await makeFolder(family._id, membership._id);

    const res = await request(app)
      .post('/api/documents')
      .set(auth)
      .field('data', JSON.stringify({ title: 'No files', folderId: String(folder._id) }));

    expect(res.status).toBe(400);
  });

  it('full CRUD lifecycle: create, list, patch, add/replace/delete file, delete document', async () => {
    const { family, membership, auth } = await makeFamilyWithAdmin();
    const folder = await makeFolder(family._id, membership._id);

    const createRes = await request(app)
      .post('/api/documents')
      .set(auth)
      .field('data', JSON.stringify({ title: 'Lifecycle Doc', folderId: String(folder._id) }))
      .field('labels', JSON.stringify(['A']))
      .attach('files', await pngBuffer(), { filename: 'a.png', contentType: 'image/png' });
    expect(createRes.status).toBe(201);
    const docId = createRes.body.id;
    const fileId = createRes.body.files[0].id;

    const listRes = await request(app).get('/api/documents').set(auth);
    expect(listRes.status).toBe(200);
    expect(listRes.body.items.map((d) => d.id)).toContain(docId);
    expect(listRes.body.items[0].fileCount).toBeGreaterThanOrEqual(1);

    const patchRes = await request(app)
      .patch(`/api/documents/${docId}`)
      .set(auth)
      .send({ title: 'Renamed Doc', tags: ['renamed'] });
    expect(patchRes.status).toBe(200);
    expect(patchRes.body.title).toBe('Renamed Doc');

    const addFileRes = await request(app)
      .post(`/api/documents/${docId}/files`)
      .set(auth)
      .field('labels', JSON.stringify(['B']))
      .attach('files', pdfBuffer(), { filename: 'b.pdf', contentType: 'application/pdf' });
    expect(addFileRes.status).toBe(200);
    expect(addFileRes.body.files).toHaveLength(2);

    const patchFileRes = await request(app)
      .patch(`/api/documents/${docId}/files/${fileId}`)
      .set(auth)
      .send({ label: 'Renamed label', order: 5 });
    expect(patchFileRes.status).toBe(200);
    const renamedFile = patchFileRes.body.files.find((f) => f.id === fileId);
    expect(renamedFile.label).toBe('Renamed label');

    const replaceRes = await request(app)
      .put(`/api/documents/${docId}/files/${fileId}`)
      .set(auth)
      .attach('file', pdfBuffer(), { filename: 'replaced.pdf', contentType: 'application/pdf' });
    expect(replaceRes.status).toBe(200);
    const replacedFile = replaceRes.body.files.find((f) => f.id === fileId);
    expect(replacedFile.mimeType).toBe('application/pdf');
    expect(replacedFile.label).toBe('Renamed label'); // label/order preserved across replace

    const deleteFileRes = await request(app).delete(`/api/documents/${docId}/files/${fileId}`).set(auth);
    expect(deleteFileRes.status).toBe(200);
    expect(deleteFileRes.body.files).toHaveLength(1);

    const deleteDocRes = await request(app).delete(`/api/documents/${docId}`).set(auth);
    expect(deleteDocRes.status).toBe(204);

    const getAfterDelete = await request(app).get(`/api/documents/${docId}`).set(auth);
    expect(getAfterDelete.status).toBe(404);
  }, 30000);

  it('GET /documents supports q= and always includes an itemResults key', async () => {
    const { family, membership, auth } = await makeFamilyWithAdmin();
    const folder = await makeFolder(family._id, membership._id);

    await request(app)
      .post('/api/documents')
      .set(auth)
      .field('data', JSON.stringify({ title: 'Searchable Passport', folderId: String(folder._id) }))
      .field('labels', JSON.stringify(['x']))
      .attach('files', await pngBuffer(), { filename: 'p.png', contentType: 'image/png' });

    const res = await request(app).get('/api/documents').query({ q: 'Passport' }).set(auth);
    expect(res.status).toBe(200);
    expect(res.body.items.some((d) => d.title === 'Searchable Passport')).toBe(true);
    expect(Array.isArray(res.body.itemResults)).toBe(true);
  });
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

describe('sensitive custom field masking + reveal', () => {
  it('never returns plaintext in list/detail; reveal requires X-Reauth when required by family settings', async () => {
    const { family, membership, auth } = await makeFamilyWithAdmin({ requireReauthForSecrets: true });
    const folder = await makeFolder(family._id, membership._id);

    const createRes = await request(app)
      .post('/api/documents')
      .set(auth)
      .field(
        'data',
        JSON.stringify({
          title: 'Bank KYC',
          folderId: String(folder._id),
          customFields: [{ key: 'PAN Number', value: 'ABCDE1234F', type: 'text', sensitive: true }],
        }),
      )
      .field('labels', JSON.stringify(['x']))
      .attach('files', await pngBuffer(), { filename: 'x.png', contentType: 'image/png' });
    expect(createRes.status).toBe(201);
    const docId = createRes.body.id;

    const field = createRes.body.customFields[0];
    expect(field.sensitive).toBe(true);
    expect(field.hasValue).toBe(true);
    expect(field.value).toBeUndefined();
    expect(field.masked.endsWith('234F')).toBe(true);
    expect(field.masked).not.toContain('ABCDE1234F');
    expect(JSON.stringify(createRes.body)).not.toContain('ABCDE1234F');

    // detail (GET) also never leaks it
    const detailRes = await request(app).get(`/api/documents/${docId}`).set(auth);
    expect(JSON.stringify(detailRes.body)).not.toContain('ABCDE1234F');

    // reveal without X-Reauth -> 401 REAUTH_REQUIRED
    const noReauthRes = await request(app)
      .get(`/api/documents/${docId}/fields/${field.id}/reveal`)
      .set(auth);
    expect(noReauthRes.status).toBe(401);
    expect(noReauthRes.body.code).toBe('REAUTH_REQUIRED');

    // reveal with a valid X-Reauth -> plaintext
    const reauthToken = signReauthToken({ membershipId: membership._id, familyId: family._id });
    const revealRes = await request(app)
      .get(`/api/documents/${docId}/fields/${field.id}/reveal`)
      .set(auth)
      .set('X-Reauth', reauthToken);
    expect(revealRes.status).toBe(200);
    expect(revealRes.body.value).toBe('ABCDE1234F');
  });

  it('reveal skips the X-Reauth gate when Family.settings.requireReauthForSecrets is false', async () => {
    const { family, membership, auth } = await makeFamilyWithAdmin({ requireReauthForSecrets: false });
    const folder = await makeFolder(family._id, membership._id);

    const createRes = await request(app)
      .post('/api/documents')
      .set(auth)
      .field(
        'data',
        JSON.stringify({
          title: 'Wifi',
          folderId: String(folder._id),
          customFields: [{ key: 'Wifi Password', value: 'S3cr3t!', type: 'text', sensitive: true }],
        }),
      )
      .field('labels', JSON.stringify(['x']))
      .attach('files', await pngBuffer(), { filename: 'x.png', contentType: 'image/png' });
    const docId = createRes.body.id;
    const field = createRes.body.customFields[0];

    const revealRes = await request(app).get(`/api/documents/${docId}/fields/${field.id}/reveal`).set(auth);
    expect(revealRes.status).toBe(200);
    expect(revealRes.body.value).toBe('S3cr3t!');
  });

  it('non-sensitive custom fields are returned as plain values, not masked', async () => {
    const { family, membership, auth } = await makeFamilyWithAdmin();
    const folder = await makeFolder(family._id, membership._id);

    const createRes = await request(app)
      .post('/api/documents')
      .set(auth)
      .field(
        'data',
        JSON.stringify({
          title: 'Plain field doc',
          folderId: String(folder._id),
          customFields: [{ key: 'Issuer', value: 'RTO Delhi', type: 'text', sensitive: false }],
        }),
      )
      .field('labels', JSON.stringify(['x']))
      .attach('files', await pngBuffer(), { filename: 'x.png', contentType: 'image/png' });

    expect(createRes.body.customFields[0]).toMatchObject({ key: 'Issuer', value: 'RTO Delhi', sensitive: false });
  });
});

describe('Family.storageBytes running counter', () => {
  it('increments on upload, nets out on replace and per-file delete, unaffected by a soft document delete', async () => {
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

    // A whole-document delete is now a SOFT delete (docs/DECISIONS.md "Soft delete / recycle
    // bin") — the file bytes are still physically stored (still counted against the family's
    // quota) until a platform admin permanently purges the document from the bin, so
    // storageBytes must NOT change here.
    await request(app).delete(`/api/documents/${docId}`).set(auth);
    const afterDocDelete = await Family.findById(family._id).lean();
    expect(afterDocDelete.storageBytes).toBe(afterFileDelete.storageBytes);

    const getAfterDelete = await request(app).get(`/api/documents/${docId}`).set(auth);
    expect(getAfterDelete.status).toBe(404);
  }, 30000);
});
