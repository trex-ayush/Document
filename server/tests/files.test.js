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
import { Activity } from '../src/models/Activity.js';
import { signAccessToken } from '../src/utils/tokens.js';

async function pngBuffer() {
  return sharp({ create: { width: 12, height: 8, channels: 3, background: { r: 200, g: 60, b: 60 } } })
    .png()
    .toBuffer();
}
function pdfBuffer() {
  return Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(256, 0x20), Buffer.from('\n%%EOF')]);
}

let mongod;
let app;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  await Promise.all([Family.init(), User.init(), Membership.init(), Folder.init(), Document.init(), Activity.init()]);
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

async function createDocWithFile(auth, folderId, buffer, filename, contentType) {
  const res = await request(app)
    .post('/api/documents')
    .set(auth)
    .field('data', JSON.stringify({ title: 'File route doc', folderId }))
    .field('labels', JSON.stringify(['x']))
    .attach('files', buffer, { filename, contentType });
  return res.body;
}

describe('GET /files/:signedToken', () => {
  it('rejects a garbage/invalid token with 401 INVALID_OR_EXPIRED_FILE_TOKEN', async () => {
    const res = await request(app).get('/api/files/not-a-real-token');
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('INVALID_OR_EXPIRED_FILE_TOKEN');
  });

  it('serves inline by default and forces attachment Content-Disposition with ?download=1, logging file.download only then', async () => {
    const { family, membership, auth } = await makeFamilyWithAdmin();
    const folder = await Folder.create({ familyId: family._id, name: 'F', parentId: null, createdBy: membership._id });
    const doc = await createDocWithFile(auth, String(folder._id), pdfBuffer(), 'x.pdf', 'application/pdf');
    const file = doc.files[0];

    const inlineRes = await request(app).get(file.url);
    expect(inlineRes.status).toBe(200);
    expect(inlineRes.headers['content-disposition']).toContain('inline');
    expect(inlineRes.headers['x-content-type-options']).toBe('nosniff');

    const beforeCount = await Activity.countDocuments({ action: 'file.download' });
    expect(beforeCount).toBe(0);

    const downloadRes = await request(app).get(file.downloadUrl).query({ download: '1' });
    expect(downloadRes.status).toBe(200);
    expect(downloadRes.headers['content-disposition']).toContain('attachment');

    // give the fire-and-forget logActivity() call a tick to land
    await new Promise((r) => setTimeout(r, 50));
    const afterCount = await Activity.countDocuments({ action: 'file.download' });
    expect(afterCount).toBe(1);
  });

  it('lets the client app embed a file in an iframe, while the rest of the API stays unframeable', async () => {
    const { family, membership, auth } = await makeFamilyWithAdmin();
    const folder = await Folder.create({ familyId: family._id, name: 'F', parentId: null, createdBy: membership._id });
    const doc = await createDocWithFile(auth, String(folder._id), pdfBuffer(), 'frame.pdf', 'application/pdf');
    const clientOrigin = new URL(process.env.CLIENT_URL).origin;

    const fileRes = await request(app).get(doc.files[0].url);
    expect(fileRes.status).toBe(200);
    expect(fileRes.headers['x-frame-options']).toBeUndefined();
    expect(fileRes.headers['content-security-policy']).toContain(`frame-ancestors 'self' ${clientOrigin}`);

    const apiRes = await request(app).get('/api/health');
    expect(apiRes.headers['x-frame-options']).toBe('SAMEORIGIN');
    expect(apiRes.headers['content-security-policy']).toContain("frame-ancestors 'self';");
  });

  it('supports HTTP Range requests (for PDFs)', async () => {
    const { family, membership, auth } = await makeFamilyWithAdmin();
    const folder = await Folder.create({ familyId: family._id, name: 'F', parentId: null, createdBy: membership._id });
    const original = pdfBuffer();
    const doc = await createDocWithFile(auth, String(folder._id), original, 'range.pdf', 'application/pdf');
    const file = doc.files[0];

    const rangeRes = await request(app).get(file.url).set('Range', 'bytes=0-9');
    expect(rangeRes.status).toBe(206);
    expect(rangeRes.headers['content-range']).toBe(`bytes 0-9/${original.length}`);
    expect(rangeRes.body.length).toBe(10);
    expect(Buffer.compare(rangeRes.body, original.subarray(0, 10))).toBe(0);
  });

  it('never serves an unsafe Content-Type like text/html or image/svg+xml', async () => {
    // SVG must be rejected at upload time (not in the allowed type list) — confirm that here.
    const { family, membership, auth } = await makeFamilyWithAdmin();
    const folder = await Folder.create({ familyId: family._id, name: 'F', parentId: null, createdBy: membership._id });
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>', 'utf8');

    const res = await request(app)
      .post('/api/documents')
      .set(auth)
      .field('data', JSON.stringify({ title: 'SVG attempt', folderId: String(folder._id) }))
      .field('labels', JSON.stringify(['x']))
      .attach('files', svg, { filename: 'evil.svg', contentType: 'image/svg+xml' });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('UNSUPPORTED_FILE_TYPE');
  });
});
