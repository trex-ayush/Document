import './helpers/setupEnv.js';
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import sharp from 'sharp';
import { startTestDb, stopTestDb, clearDb } from './helpers/db.js';
import { buildApp, signupFamily, authed } from './helpers/factory.js';

// A new family starts with no folders (docs/DECISIONS.md "Items module" — no default folders), so
// documents and vault items must be creatable at the top level (folderId null).

let app;

async function pngBuffer() {
  return sharp({ create: { width: 12, height: 8, channels: 3, background: { r: 60, g: 120, b: 200 } } })
    .png()
    .toBuffer();
}

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

describe('a brand-new family', () => {
  it('has no folders after POST /family, but still gets the default document types', async () => {
    const s = await signupFamily(app);

    const tree = await authed(request(app).get('/api/folders/tree'), s);
    expect(tree.status).toBe(200);
    expect(tree.body.items).toEqual([]);

    const browse = await authed(request(app).get('/api/folders/browse'), s);
    expect(browse.status).toBe(200);
    expect(browse.body.folders).toEqual([]);

    const types = await authed(request(app).get('/api/document-types'), s);
    expect(types.status).toBe(200);
    expect(types.body.items.length).toBeGreaterThan(0);
    expect(types.body.items.every((dt) => !dt.defaultFolderId)).toBe(true);
  });

  it('can upload a document at the top level with no folder', async () => {
    const s = await signupFamily(app);

    const created = await authed(request(app).post('/api/documents'), s)
      .field('data', JSON.stringify({ title: 'Loose Passport' }))
      .attach('files', await pngBuffer(), { filename: 'passport.png', contentType: 'image/png' });
    expect(created.status).toBe(201);
    expect(created.body.folderId).toBeNull();
    expect(created.body.breadcrumbs).toEqual([]);

    // `"root"` and `null` are accepted too.
    const viaRoot = await authed(request(app).post('/api/documents'), s)
      .field('data', JSON.stringify({ title: 'Root Doc', folderId: 'root' }))
      .attach('files', await pngBuffer(), { filename: 'root.png', contentType: 'image/png' });
    expect(viaRoot.status).toBe(201);
    expect(viaRoot.body.folderId).toBeNull();

    const browse = await authed(request(app).get('/api/folders/browse'), s).query({ folderId: 'root' });
    expect(browse.body.documents.map((d) => d.id).sort()).toEqual([created.body.id, viaRoot.body.id].sort());

    // Move into a new folder and back out to the top level.
    const folder = await authed(request(app).post('/api/folders'), s).send({ name: 'Identity', parentId: 'root' });
    expect(folder.status).toBe(201);
    const moved = await authed(request(app).patch(`/api/documents/${created.body.id}`), s).send({ folderId: folder.body.id });
    expect(moved.status).toBe(200);
    expect(moved.body.folderId).toBe(folder.body.id);
    const back = await authed(request(app).patch(`/api/documents/${created.body.id}`), s).send({ folderId: null });
    expect(back.status).toBe(200);
    expect(back.body.folderId).toBeNull();
  });

  it('can create a vault item at the top level with no folder', async () => {
    const s = await signupFamily(app);

    const created = await authed(request(app).post('/api/items'), s).send({
      title: 'Wifi password',
      kind: 'login',
      fields: [{ key: 'password', value: 'hunter22', sensitive: true }],
    });
    expect(created.status).toBe(201);
    expect(created.body.folderId).toBeNull();

    const viaNull = await authed(request(app).post('/api/items'), s).send({ title: 'PAN', kind: 'record', folderId: null });
    expect(viaNull.status).toBe(201);
    expect(viaNull.body.folderId).toBeNull();

    const browse = await authed(request(app).get('/api/folders/browse'), s);
    expect(browse.body.items.map((i) => i.id).sort()).toEqual([created.body.id, viaNull.body.id].sort());

    const rootOnly = await authed(request(app).get('/api/items'), s).query({ folderId: 'root' });
    expect(rootOnly.body.total).toBe(2);

    const patched = await authed(request(app).patch(`/api/items/${created.body.id}`), s).send({ folderId: 'root', title: 'Home wifi' });
    expect(patched.status).toBe(200);
    expect(patched.body.folderId).toBeNull();
  });

  it('still rejects a folderId that does not exist in the family', async () => {
    const s = await signupFamily(app);
    const res = await authed(request(app).post('/api/items'), s).send({
      title: 'Ghost',
      kind: 'note',
      folderId: '0123456789abcdef01234567',
    });
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('FOLDER_NOT_FOUND');
  });
});
