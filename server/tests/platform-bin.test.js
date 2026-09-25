import './helpers/setupPlatformOwnerEnv.js';
import './helpers/setupEnv.js';
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import sharp from 'sharp';
import { startTestDb, stopTestDb, clearDb } from './helpers/db.js';
import { buildApp, signupFamily, authed } from './helpers/factory.js';
import { Document } from '../src/models/Document.js';
import { PLATFORM_OWNER_EMAIL } from './helpers/setupPlatformOwnerEnv.js';

let app;

beforeAll(async () => {
  await startTestDb();
}, 60000);

afterAll(async () => {
  await stopTestDb();
});

beforeEach(async () => {
  app = buildApp();
  await clearDb();
});

async function pngBuffer() {
  return sharp({ create: { width: 8, height: 8, channels: 3, background: { r: 1, g: 2, b: 3 } } })
    .png()
    .toBuffer();
}

async function makeDeletedDocument(s) {
  const folderRes = await authed(request(app).post('/api/folders'), s).send({ name: 'F', parentId: 'root' });
  const folderId = folderRes.body.id;
  const docRes = await authed(request(app).post('/api/documents'), s)
    .field('data', JSON.stringify({ title: 'Purge me', folderId }))
    .field('labels', JSON.stringify(['x']))
    .attach('files', await pngBuffer(), { filename: 'x.png', contentType: 'image/png' });
  const docId = docRes.body.id;
  await authed(request(app).delete(`/api/documents/${docId}`), s).expect(204);
  return docId;
}

describe('GET /platform-settings/bin (cross-family)', () => {
  it('403s for anyone but the platform owner', async () => {
    const s = await signupFamily(app);
    const res = await authed(request(app).get('/api/platform-settings/bin'), s);
    expect(res.status).toBe(403);
  });

  it('the platform owner sees bin entries from a family they are not even a member of', async () => {
    const owner = await signupFamily(app, { email: PLATFORM_OWNER_EMAIL });
    const other = await signupFamily(app);
    const docId = await makeDeletedDocument(other);

    const res = await authed(request(app).get('/api/platform-settings/bin'), owner);
    expect(res.status).toBe(200);
    const entry = res.body.items.find((i) => i.id === docId);
    expect(entry).toBeTruthy();
    expect(entry.familyId).toBe(other.familyId);
  });
});

describe('POST /platform-settings/bin/purge', () => {
  it('403s for anyone but the platform owner', async () => {
    const s = await signupFamily(app);
    const docId = await makeDeletedDocument(s);
    const res = await authed(request(app).post('/api/platform-settings/bin/purge'), s).send({
      items: [{ type: 'document', id: docId }],
    });
    expect(res.status).toBe(403);

    const stillThere = await Document.findOne({ _id: docId, deletedAt: { $exists: true } }).lean();
    expect(stillThere).toBeTruthy();
  });

  it('the platform owner permanently removes the row, across any family', async () => {
    const owner = await signupFamily(app, { email: PLATFORM_OWNER_EMAIL });
    const other = await signupFamily(app);
    const docId = await makeDeletedDocument(other);

    const res = await authed(request(app).post('/api/platform-settings/bin/purge'), owner).send({
      items: [{ type: 'document', id: docId }],
    });
    expect(res.status).toBe(200);
    expect(res.body.results).toEqual([{ type: 'document', id: docId, purged: true }]);

    const gone = await Document.findOne({ _id: docId, deletedAt: { $exists: true } }).lean();
    expect(gone).toBeNull();
  });

  it('cannot purge a row that is not actually in the bin (still active)', async () => {
    const owner = await signupFamily(app, { email: PLATFORM_OWNER_EMAIL });
    const folderRes = await authed(request(app).post('/api/folders'), owner).send({ name: 'F', parentId: 'root' });
    const docRes = await authed(request(app).post('/api/documents'), owner)
      .field('data', JSON.stringify({ title: 'Still active', folderId: folderRes.body.id }))
      .field('labels', JSON.stringify(['x']))
      .attach('files', await pngBuffer(), { filename: 'x.png', contentType: 'image/png' });

    const res = await authed(request(app).post('/api/platform-settings/bin/purge'), owner).send({
      items: [{ type: 'document', id: docRes.body.id }],
    });
    expect(res.status).toBe(200);
    expect(res.body.results[0].purged).toBe(false);

    const stillActive = await Document.findById(docRes.body.id).lean();
    expect(stillActive).toBeTruthy();
  });
});

describe('POST /platform-settings/bin/purge — single files', () => {
  it('permanently removes one file that was moved to the Bin, leaving the rest of the document', async () => {
    const owner = await signupFamily(app, { email: PLATFORM_OWNER_EMAIL });
    const s = await signupFamily(app);
    const folderRes = await authed(request(app).post('/api/folders'), s).send({ name: 'F', parentId: 'root' });
    const docRes = await authed(request(app).post('/api/documents'), s)
      .field('data', JSON.stringify({ title: 'Two files', folderId: folderRes.body.id }))
      .field('labels', JSON.stringify(['front', 'back']))
      .attach('files', await pngBuffer(), { filename: 'front.png', contentType: 'image/png' })
      .attach('files', await pngBuffer(), { filename: 'back.png', contentType: 'image/png' });
    expect(docRes.status).toBe(201);
    const docId = docRes.body.id;
    const [front, back] = docRes.body.files;

    await authed(request(app).delete(`/api/documents/${docId}/files/${front.id}`), s).expect(200);

    const purge = await authed(request(app).post('/api/platform-settings/bin/purge'), owner).send({
      items: [{ type: 'file', id: front.id }],
    });
    expect(purge.status).toBe(200);
    expect(purge.body.results).toEqual([{ type: 'file', id: front.id, purged: true }]);

    const doc = await Document.findById(docId).lean();
    expect(doc.files.map((f) => String(f._id))).toEqual([back.id]);

    const bin = await authed(request(app).get('/api/bin'), s);
    expect(bin.body.items.find((i) => i.id === front.id)).toBeUndefined();
  });
});
