import './helpers/setupEnv.js';
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import sharp from 'sharp';
import { startTestDb, stopTestDb, clearDb } from './helpers/db.js';
import { buildApp, signupFamily, authed } from './helpers/factory.js';

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
  return sharp({ create: { width: 8, height: 8, channels: 3, background: { r: 10, g: 20, b: 30 } } })
    .png()
    .toBuffer();
}

async function makeFolder(s, name = 'Folder', parentId = 'root') {
  const res = await authed(request(app).post('/api/folders'), s).send({ name, parentId });
  return res.body.id;
}

async function makeDocument(s, folderId, title = 'Doc') {
  const res = await authed(request(app).post('/api/documents'), s)
    .field('data', JSON.stringify({ title, folderId }))
    .field('labels', JSON.stringify(['x']))
    .attach('files', await pngBuffer(), { filename: 'x.png', contentType: 'image/png' });
  return res.body.id;
}

async function makeItem(s, folderId, title = 'Item') {
  const res = await authed(request(app).post('/api/items'), s).send({ title, folderId, kind: 'note' });
  return res.body.id;
}

describe('GET /bin', () => {
  it('lists soft-deleted documents, folders and items, newest-deleted first', async () => {
    const s = await signupFamily(app);
    const folderId = await makeFolder(s);
    const docId = await makeDocument(s, folderId);
    const itemId = await makeItem(s, folderId);

    await authed(request(app).delete(`/api/documents/${docId}`), s).expect(204);
    await authed(request(app).delete(`/api/items/${itemId}`), s).expect(204);

    const res = await authed(request(app).get('/api/bin'), s);
    expect(res.status).toBe(200);
    const types = res.body.items.map((i) => i.type).sort();
    expect(types).toEqual(['document', 'item']);
  });

  it('an active (never-deleted) document/folder/item never appears in the bin', async () => {
    const s = await signupFamily(app);
    const folderId = await makeFolder(s);
    await makeDocument(s, folderId);

    const res = await authed(request(app).get('/api/bin'), s);
    expect(res.status).toBe(200);
    expect(res.body.items).toEqual([]);
  });
});

describe('POST /bin/document/:id/restore', () => {
  it('restores a soft-deleted document so it reappears in normal lists', async () => {
    const s = await signupFamily(app);
    const folderId = await makeFolder(s);
    const docId = await makeDocument(s, folderId);
    await authed(request(app).delete(`/api/documents/${docId}`), s).expect(204);

    const restore = await authed(request(app).post(`/api/bin/document/${docId}/restore`), s);
    expect(restore.status).toBe(200);

    const getDoc = await authed(request(app).get(`/api/documents/${docId}`), s);
    expect(getDoc.status).toBe(200);

    const bin = await authed(request(app).get('/api/bin'), s);
    expect(bin.body.items).toEqual([]);
  });

  it('restoring a document also restores its deleted ancestor folder chain', async () => {
    const s = await signupFamily(app);
    const parentId = await makeFolder(s, 'Parent');
    const childId = await makeFolder(s, 'Child', parentId);
    const docId = await makeDocument(s, childId);

    // Deleting the parent folder cascades: parent, child, and the document all move to the bin.
    await authed(request(app).delete(`/api/folders/${parentId}`), s).query({ confirm: 1 }).expect(200);

    const restore = await authed(request(app).post(`/api/bin/document/${docId}/restore`), s);
    expect(restore.status).toBe(200);

    const getDoc = await authed(request(app).get(`/api/documents/${docId}`), s);
    expect(getDoc.status).toBe(200);
    const getChild = await authed(request(app).get('/api/folders/browse'), s).query({ folderId: parentId });
    expect(getChild.status).toBe(200);
    expect(getChild.body.folders.map((f) => f.id)).toContain(childId);
  });

  it('404 NOT_IN_BIN when the document is not actually deleted', async () => {
    const s = await signupFamily(app);
    const folderId = await makeFolder(s);
    const docId = await makeDocument(s, folderId);

    const res = await authed(request(app).post(`/api/bin/document/${docId}/restore`), s);
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('NOT_IN_BIN');
  });

  it('a read-only member cannot restore (403)', async () => {
    const s = await signupFamily(app);
    const folderId = await makeFolder(s);
    const docId = await makeDocument(s, folderId);
    await authed(request(app).delete(`/api/documents/${docId}`), s).expect(204);

    const readerEmail = `reader-${Date.now()}@example.com`;
    await authed(request(app).post('/api/members'), s)
      .send({ name: 'Reader', email: readerEmail, tempPassword: 'password123', access: 'read' })
      .expect(201);
    const login = await request(app).post('/api/auth/login').send({ email: readerEmail, password: 'password123' });

    const res = await request(app)
      .post(`/api/bin/document/${docId}/restore`)
      .set('Authorization', `Bearer ${login.body.accessToken}`)
      .set('X-Family-Id', s.familyId);
    expect(res.status).toBe(403);
  });
});

describe('POST /bin/folder/:id/restore', () => {
  it('restores a folder and its whole soft-deleted subtree together', async () => {
    const s = await signupFamily(app);
    const parentId = await makeFolder(s, 'Parent');
    const childId = await makeFolder(s, 'Child', parentId);
    const docId = await makeDocument(s, childId);
    const itemId = await makeItem(s, childId);

    await authed(request(app).delete(`/api/folders/${parentId}`), s).query({ confirm: 1 }).expect(200);

    const restore = await authed(request(app).post(`/api/bin/folder/${parentId}/restore`), s);
    expect(restore.status).toBe(200);

    const getDoc = await authed(request(app).get(`/api/documents/${docId}`), s);
    expect(getDoc.status).toBe(200);
    const getItem = await authed(request(app).get(`/api/items/${itemId}`), s);
    expect(getItem.status).toBe(200);
    const tree = await authed(request(app).get('/api/folders/tree'), s);
    const ids = tree.body.items.map((f) => f.id);
    expect(ids).toContain(parentId);
    expect(ids).toContain(childId);

    const bin = await authed(request(app).get('/api/bin'), s);
    expect(bin.body.items).toEqual([]);
  });
});
