import './helpers/setupEnv.js';
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import sharp from 'sharp';
import { startTestDb, stopTestDb, clearDb } from './helpers/db.js';
import { buildApp, signupFamily, authed } from './helpers/factory.js';

// Every family has exactly one system folder, "Shared", at the top level. Anything added without
// a folder goes there, so the top level only ever holds folders.

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
  it('starts with just the Shared folder and no document types', async () => {
    const s = await signupFamily(app);

    const tree = await authed(request(app).get('/api/folders/tree'), s);
    expect(tree.status).toBe(200);
    expect(tree.body.items).toHaveLength(1);
    expect(tree.body.items[0]).toMatchObject({ name: 'Shared', isSystem: true, parentId: null, documentCount: 0 });

    const browse = await authed(request(app).get('/api/folders/browse'), s);
    expect(browse.body.folders.map((f) => f.name)).toEqual(['Shared']);

    const types = await authed(request(app).get('/api/document-types'), s);
    expect(types.status).toBe(404);
  });

  it('files a document uploaded without a folder into Shared', async () => {
    const s = await signupFamily(app);
    const sharedId = (await authed(request(app).get('/api/folders/tree'), s)).body.items[0].id;

    const created = await authed(request(app).post('/api/documents'), s)
      .field('data', JSON.stringify({ title: 'Loose Passport' }))
      .attach('files', await pngBuffer(), { filename: 'passport.png', contentType: 'image/png' });
    expect(created.status).toBe(201);
    expect(created.body.folderId).toBe(sharedId);

    // Nothing loose at the top level; it shows inside Shared.
    const root = await authed(request(app).get('/api/folders/browse'), s).query({ folderId: 'root' });
    expect(root.body.documents).toEqual([]);
    expect(root.body.folders[0].documentCount).toBe(1);
    const inShared = await authed(request(app).get('/api/folders/browse'), s).query({ folderId: sharedId });
    expect(inShared.body.documents.map((d) => d.id)).toEqual([created.body.id]);
  });

  it('files a password or note saved without a folder into Shared', async () => {
    const s = await signupFamily(app);
    const sharedId = (await authed(request(app).get('/api/folders/tree'), s)).body.items[0].id;

    const login = await authed(request(app).post('/api/items'), s).send({ kind: 'login', title: 'Wifi', password: 'hunter22' });
    const note = await authed(request(app).post('/api/items'), s).send({ kind: 'note', title: 'Gas agency', folderId: null });
    expect(login.status).toBe(201);
    expect(note.status).toBe(201);
    expect(login.body.folderId).toBe(sharedId);
    expect(note.body.folderId).toBe(sharedId);

    const inShared = await authed(request(app).get('/api/folders/browse'), s).query({ folderId: sharedId });
    expect(inShared.body.items.map((i) => i.id).sort()).toEqual([login.body.id, note.body.id].sort());
  });

  it('new members can add things straight away (write access by default)', async () => {
    const s = await signupFamily(app);
    const created = await authed(request(app).post('/api/members'), s).send({
      name: 'Rahul',
      email: 'rahul-new-family@example.com',
      tempPassword: 'password123',
    });
    expect(created.status).toBe(201);
    expect(created.body.access).toBe('write');

    const login = await request(app).post('/api/auth/login').send({ email: 'rahul-new-family@example.com', password: 'password123' });
    const rahul = { accessToken: login.body.accessToken, familyId: s.familyId };
    const note = await authed(request(app).post('/api/items'), rahul).send({ kind: 'note', title: 'Hello' });
    expect(note.status).toBe(201);
  });
});
