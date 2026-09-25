import './helpers/setupEnv.js';
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import { startTestDb, stopTestDb, clearDb } from './helpers/db.js';
import { buildApp, signupFamily, authed } from './helpers/factory.js';
import { Folder } from '../src/models/Folder.js';
import { Document } from '../src/models/Document.js';
import { VaultItem } from '../src/models/VaultItem.js';
import { encryptFieldValue } from '../src/utils/crypto.js';

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

const enc = (v) => (v ? encryptFieldValue(v) : '');

async function folder(s, name, parent = null) {
  return Folder.create({
    familyId: s.familyId,
    name,
    parentId: parent ? parent._id : null,
    createdBy: s.membership.id,
  });
}

let fileCounter = 0;
function fakeFile(s, { thumb = false } = {}) {
  fileCounter += 1;
  return {
    storageKey: `files/fake-${fileCounter}`,
    thumbKey: thumb ? `thumbs/fake-${fileCounter}` : null,
    originalName: 'scan.jpg',
    mimeType: 'image/jpeg',
    size: 10,
    encryption: { iv: 'a', tag: 'b', wrappedKey: 'c', keyIv: 'd', keyTag: 'e' },
    uploadedBy: s.membership.id,
  };
}

async function doc(s, f, title, { notes = '', files = [], updatedAt } = {}) {
  const d = await Document.create({
    familyId: s.familyId,
    folderId: f._id,
    title,
    notes: enc(notes),
    files,
    createdBy: s.membership.id,
  });
  if (updatedAt) await Document.collection.updateOne({ _id: d._id }, { $set: { updatedAt } });
  return d;
}

async function item(s, f, kind, title, { username = '', password = '', fields = [], notes = '' } = {}) {
  return VaultItem.create({
    familyId: s.familyId,
    folderId: f._id,
    kind,
    title,
    username: enc(username),
    password: enc(password),
    fields: fields.map(({ key, value }) => ({ key, value: enc(value) })),
    notes: enc(notes),
    createdBy: s.membership.id,
  });
}

function search(s, query) {
  return authed(request(app).get('/api/search').query(query), s);
}

describe('GET /api/search', () => {
  it('requires sign-in and a family', async () => {
    const res = await request(app).get('/api/search?q=a');
    expect(res.status).toBe(401);
  });

  it.each([[{}], [{ q: '   ' }], [{ q: 'a', limit: 51 }], [{ q: 'a', folderId: 'nope' }]])(
    'rejects bad query %j with 400',
    async (query) => {
      const s = await signupFamily(app);
      const res = await search(s, query);
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
    },
  );

  it('always returns all three lists', async () => {
    const s = await signupFamily(app);
    const res = await search(s, { q: 'zzz-nothing' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ folders: [], documents: [], items: [] });
  });

  it('matches folder names case-insensitively by part of the name, with a breadcrumb path', async () => {
    const s = await signupFamily(app);
    const shared = await folder(s, 'Home');
    const papa = await folder(s, 'Papa Documents', shared);

    const res = await search(s, { q: 'pApA' });
    expect(res.status).toBe(200);
    expect(res.body.folders).toEqual([
      { id: papa.id, name: 'Papa Documents', parentId: shared.id, isSystem: false, path: 'Home' },
    ]);
  });

  it('matches document titles and encrypted notes, with a snippet only for note matches', async () => {
    const s = await signupFamily(app);
    const shared = await folder(s, 'Home');
    const papa = await folder(s, 'Papa', shared);
    await doc(s, papa, 'Passport renewal');
    await doc(s, papa, 'Electricity bill', {
      notes: 'Paid at the counter. Keep the passport copy with this receipt for the office.',
    });
    await doc(s, papa, 'Car insurance');

    const res = await search(s, { q: 'PASSPORT' });
    expect(res.status).toBe(200);
    expect(res.body.documents.map((d) => d.title)).toEqual(['Passport renewal', 'Electricity bill']);

    const [byTitle, byNotes] = res.body.documents;
    expect(byTitle.snippet).toBeNull();
    expect(byTitle.path).toBe('Home › Papa');
    expect(byTitle.folderId).toBe(papa.id);
    expect(byTitle.fileCount).toBe(0);
    expect(byTitle.thumbnailUrl).toBeNull();
    expect(byNotes.snippet).toContain('passport copy');
    expect(byNotes.snippet.length).toBeLessThan(120);
    expect(byNotes).not.toHaveProperty('notes');

    // Notes are encrypted at rest — searching never writes plaintext back.
    const raw = await Document.collection.findOne({ title: 'Electricity bill' });
    expect(raw.notes).not.toContain('passport');
  });

  it('returns a signed thumbnail URL and file count for documents with files', async () => {
    const s = await signupFamily(app);
    const f = await folder(s, 'Home');
    await doc(s, f, 'Aadhaar card', { files: [fakeFile(s), fakeFile(s, { thumb: true })] });

    const res = await search(s, { q: 'aadhaar' });
    expect(res.body.documents[0].fileCount).toBe(2);
    expect(res.body.documents[0].thumbnailUrl).toMatch(/^\/api\/files\/.+/);
  });

  it('matches items by title, username, extra field key or value and notes — never by password', async () => {
    const s = await signupFamily(app);
    const f = await folder(s, 'Home');
    await item(s, f, 'login', 'Netflix', {
      username: 'papa.sharma@example.com',
      password: 'SuperSecret-9981',
      fields: [{ key: 'Security PIN', value: '4521' }],
      notes: 'Shared with the kids on weekends',
    });
    await item(s, f, 'note', 'Wifi at grandma', { notes: 'Router is behind the TV, network name: Sharma-Home' });

    const byTitle = await search(s, { q: 'netfl' });
    expect(byTitle.body.items).toHaveLength(1);
    expect(byTitle.body.items[0]).toMatchObject({ kind: 'login', title: 'Netflix', path: 'Home', snippet: null });

    const byUsername = await search(s, { q: 'papa.sharma' });
    expect(byUsername.body.items.map((i) => i.title)).toEqual(['Netflix']);
    expect(byUsername.body.items[0].snippet).toContain('papa.sharma@example.com');

    const byFieldKey = await search(s, { q: 'security pin' });
    expect(byFieldKey.body.items.map((i) => i.title)).toEqual(['Netflix']);
    expect(byFieldKey.body.items[0].snippet).toContain('Security PIN: 4521');

    const byFieldValue = await search(s, { q: '4521' });
    expect(byFieldValue.body.items.map((i) => i.title)).toEqual(['Netflix']);

    const byNotes = await search(s, { q: 'sharma-home' });
    expect(byNotes.body.items.map((i) => i.title)).toEqual(['Wifi at grandma']);
    expect(byNotes.body.items[0].kind).toBe('note');

    const byPassword = await search(s, { q: 'SuperSecret' });
    expect(byPassword.body).toEqual({ folders: [], documents: [], items: [] });

    const everything = await search(s, { q: 'a' });
    expect(JSON.stringify(everything.body)).not.toContain('SuperSecret');
    expect(everything.body.items.every((i) => !('password' in i))).toBe(true);
  });

  it('ranks title matches first, then the most recently updated', async () => {
    const s = await signupFamily(app);
    const f = await folder(s, 'Home');
    await doc(s, f, 'Old tax return', { updatedAt: new Date('2024-01-01') });
    await doc(s, f, 'Salary slip', { notes: 'for the tax file', updatedAt: new Date('2026-09-01') });
    await doc(s, f, 'New tax return', { updatedAt: new Date('2026-01-01') });

    const res = await search(s, { q: 'tax' });
    expect(res.body.documents.map((d) => d.title)).toEqual(['New tax return', 'Old tax return', 'Salary slip']);
  });

  it('inside a folder, looks only in that folder and its subfolders', async () => {
    const s = await signupFamily(app);
    const home = await folder(s, 'Home');
    const papa = await folder(s, 'Papa bills', home);
    const papaOld = await folder(s, 'Old bills', papa);
    const mummy = await folder(s, 'Mummy bills', home);
    await doc(s, papa, 'Water bill');
    await doc(s, papaOld, 'Gas bill 2019');
    await doc(s, mummy, 'Phone bill');
    await item(s, papaOld, 'note', 'Bill due dates');
    await item(s, mummy, 'note', 'Bill reminders');

    const res = await search(s, { q: 'bill', folderId: papa.id });
    expect(res.status).toBe(200);
    expect(res.body.folders.map((x) => x.name)).toEqual(['Old bills']); // not the folder itself
    expect(res.body.documents.map((d) => d.title).sort()).toEqual(['Gas bill 2019', 'Water bill']);
    expect(res.body.items.map((i) => i.title)).toEqual(['Bill due dates']);

    const everywhere = await search(s, { q: 'bill', folderId: 'root' });
    expect(everywhere.body.documents).toHaveLength(3);
    expect(everywhere.body.folders).toHaveLength(3);
  });

  it('404s a folder from another family (or one that does not exist)', async () => {
    const a = await signupFamily(app);
    const b = await signupFamily(app);
    const bFolder = await folder(b, 'B stuff');

    const res = await search(a, { q: 'stuff', folderId: bFolder.id });
    expect(res.status).toBe(404);
    const missing = await search(a, { q: 'stuff', folderId: new mongoose.Types.ObjectId().toString() });
    expect(missing.status).toBe(404);
  });

  it("never returns another family's folders, documents or items", async () => {
    const a = await signupFamily(app);
    const b = await signupFamily(app);
    const bFolder = await folder(b, 'Secret family folder');
    await doc(b, bFolder, 'Secret family deed');
    await item(b, bFolder, 'note', 'Secret family note');

    const res = await search(a, { q: 'secret family' });
    expect(res.body).toEqual({ folders: [], documents: [], items: [] });
  });

  it('skips things in the bin', async () => {
    const s = await signupFamily(app);
    const f = await folder(s, 'Home');
    const d = await doc(s, f, 'Deleted will');
    await Document.collection.updateOne({ _id: d._id }, { $set: { deletedAt: new Date() } });

    const res = await search(s, { q: 'will' });
    expect(res.body.documents).toEqual([]);
  });

  it('caps each list at limit (default 20)', async () => {
    const s = await signupFamily(app);
    const f = await folder(s, 'Home');
    await Promise.all(Array.from({ length: 25 }, (_, i) => doc(s, f, `Receipt ${i}`)));

    const byDefault = await search(s, { q: 'receipt' });
    expect(byDefault.body.documents).toHaveLength(20);
    const small = await search(s, { q: 'receipt', limit: 5 });
    expect(small.body.documents).toHaveLength(5);
  });
});
