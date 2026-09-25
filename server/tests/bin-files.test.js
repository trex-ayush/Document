import './helpers/setupEnv.js';
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import sharp from 'sharp';
import mongoose from 'mongoose';
import { startTestDb, stopTestDb, clearDb } from './helpers/db.js';
import { buildApp, signupFamily, authed } from './helpers/factory.js';
import { Document } from '../src/models/Document.js';
import { Family } from '../src/models/Family.js';
import { Activity } from '../src/models/Activity.js';
import { getStorage } from '../src/storage/index.js';
import { permanentlyPurgeOne, findBinEntryFamilyId, listBinEntriesAllFamilies } from '../src/modules/bin/lib.js';

// A single file deleted out of a document goes to the Bin (docs/DECISIONS.md "Soft delete /
// recycle bin"): hidden everywhere, blob kept, restorable, and only removed for good by a purge.

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

async function pngBuffer(r = 10) {
  return sharp({ create: { width: 8, height: 8, channels: 3, background: { r, g: 20, b: 30 } } })
    .png()
    .toBuffer();
}

function binaryParser(res, callback) {
  const chunks = [];
  res.on('data', (c) => chunks.push(c));
  res.on('end', () => callback(null, Buffer.concat(chunks)));
}

async function makeFolder(s, name = 'Papers') {
  const res = await authed(request(app).post('/api/folders'), s).send({ name, parentId: 'root' });
  return res.body.id;
}

/** A document with two files: "Front" (front.png) and "Back" (back.png). */
async function makeTwoFileDocument(s, folderId, title = 'Aadhaar') {
  const res = await authed(request(app).post('/api/documents'), s)
    .field('data', JSON.stringify({ title, folderId }))
    .field('labels', JSON.stringify(['Front', 'Back']))
    .attach('files', await pngBuffer(10), { filename: 'front.png', contentType: 'image/png' })
    .attach('files', await pngBuffer(90), { filename: 'back.png', contentType: 'image/png' });
  expect(res.status).toBe(201);
  const [front, back] = res.body.files;
  return { docId: res.body.id, front, back };
}

async function rawFile(docId, fileId) {
  const doc = await Document.collection.findOne({ _id: new mongoose.Types.ObjectId(docId) });
  return doc.files.find((f) => String(f._id) === fileId);
}

async function createShare(s, body) {
  const res = await authed(request(app).post('/api/shares'), s).send(body);
  expect(res.status).toBe(201);
  return res.body.url.split('/s/')[1];
}

async function downloadZip(url) {
  const res = await request(app).get(url).buffer(true).parse(binaryParser);
  expect(res.status).toBe(200);
  return res.body.toString('latin1');
}

describe('deleting one file moves it to the Bin', () => {
  it('hides the file everywhere, keeps the blob, lists it in the Bin, and restore brings it back', async () => {
    const s = await signupFamily(app);
    const folderId = await makeFolder(s);
    const { docId, front, back } = await makeTwoFileDocument(s, folderId);
    const wholeDocShareToken = await createShare(s, { targetType: 'document', targetId: docId });
    const frontOnlyShareToken = await createShare(s, { targetType: 'document', targetId: docId, fileIds: [front.id] });
    const folderShareToken = await createShare(s, { targetType: 'folder', targetId: folderId });
    const storageBytesBefore = (await Family.findById(s.familyId).lean()).storageBytes;

    const del = await authed(request(app).delete(`/api/documents/${docId}/files/${front.id}`), s);
    expect(del.status).toBe(200);
    expect(del.body.files.map((f) => f.id)).toEqual([back.id]);

    // The stored blob and thumbnail are untouched, and still counted against the quota.
    const stored = await rawFile(docId, front.id);
    expect(stored.deletedAt).toBeInstanceOf(Date);
    expect(String(stored.deletedBy)).toBe(s.membership.id);
    const storage = await getStorage();
    expect(await storage.stat(stored.storageKey)).not.toBeNull();
    expect(await storage.stat(stored.thumbKey)).not.toBeNull();
    expect((await Family.findById(s.familyId).lean()).storageBytes).toBe(storageBytesBefore);

    // Document detail, list, browse and search.
    const detail = await authed(request(app).get(`/api/documents/${docId}`), s);
    expect(detail.body.files.map((f) => f.id)).toEqual([back.id]);
    const list = await authed(request(app).get('/api/documents').query({ folderId }), s);
    expect(list.body.items[0].fileCount).toBe(1);
    expect(list.body.items[0].primaryThumbUrl).toMatch(/^\/api\/files\//);
    const browse = await authed(request(app).get('/api/folders/browse').query({ folderId }), s);
    expect(browse.body.documents[0].fileCount).toBe(1);
    const search = await authed(request(app).get('/api/search').query({ q: 'Aadhaar' }), s);
    expect(search.body.documents[0].fileCount).toBe(1);
    const folderPrecheck = await authed(request(app).delete(`/api/folders/${folderId}`), s);
    expect(folderPrecheck.body.fileCount).toBe(1);

    // Its old signed URLs stop working; the other file's still work.
    expect((await request(app).get(front.url)).status).toBe(401);
    expect((await request(app).get(front.thumbUrl)).status).toBe(401);
    expect((await request(app).get(front.downloadUrl)).status).toBe(401);
    expect((await request(app).get(back.url)).status).toBe(200);

    // ZIP download of the document.
    const zipLink = await authed(request(app).post(`/api/documents/${docId}/zip-link`), s).send({});
    const zip = await downloadZip(zipLink.body.url);
    expect(zip).toContain('back.png');
    expect(zip).not.toContain('front.png');
    const zipOfDeleted = await authed(request(app).post(`/api/documents/${docId}/zip-link`), s).send({ fileIds: [front.id] });
    expect(zipOfDeleted.status).toBe(400);

    // Public share pages, their ZIPs, and share fileIds.
    const pubDoc = await request(app).get(`/api/public/shares/${wholeDocShareToken}`);
    expect(pubDoc.body.document.files.map((f) => f.id)).toEqual([back.id]);
    const pubFrontOnly = await request(app).get(`/api/public/shares/${frontOnlyShareToken}`);
    expect(pubFrontOnly.body.document.files).toEqual([]);
    const pubFrontOnlyZip = await request(app).post(`/api/public/shares/${frontOnlyShareToken}/zip-link`);
    expect(pubFrontOnlyZip.status).toBe(404);
    const pubFolder = await request(app).get(`/api/public/shares/${folderShareToken}`);
    expect(pubFolder.body.folderTree.documents[0].files.map((f) => f.id)).toEqual([back.id]);
    const pubFolderZip = await request(app)
      .post(`/api/public/shares/${folderShareToken}/zip-link`)
      .buffer(true)
      .parse(binaryParser);
    expect(pubFolderZip.status).toBe(200);
    expect(pubFolderZip.body.toString('latin1')).toContain('Back');
    expect(pubFolderZip.body.toString('latin1')).not.toContain('Front');
    const newShare = await authed(request(app).post('/api/shares'), s).send({
      targetType: 'document',
      targetId: docId,
      fileIds: [front.id],
    });
    expect(newShare.status).toBe(404);

    // Deleting it again is a 404.
    const again = await authed(request(app).delete(`/api/documents/${docId}/files/${front.id}`), s);
    expect(again.status).toBe(404);
    expect(again.body.code).toBe('FILE_NOT_FOUND');

    // Listed in the Bin.
    const bin = await authed(request(app).get('/api/bin'), s);
    expect(bin.body.items).toHaveLength(1);
    expect(bin.body.items[0]).toMatchObject({
      id: front.id,
      type: 'file',
      name: 'Front',
      originalName: 'front.png',
      documentId: docId,
      documentTitle: 'Aadhaar',
      documentDeleted: false,
      deletedBy: s.membership.id,
      deletedByName: s.membership.name,
    });
    expect(bin.body.items[0].deletedAt).toBeTruthy();

    // Restore puts it back.
    const restore = await authed(request(app).post(`/api/bin/file/${front.id}/restore`), s);
    expect(restore.status).toBe(200);
    expect(restore.body.restored).toEqual({ type: 'file', id: front.id, documentId: docId, documentRestored: false });

    const after = await authed(request(app).get(`/api/documents/${docId}`), s);
    expect(after.body.files.map((f) => f.id)).toEqual([front.id, back.id]);
    expect((await request(app).get(after.body.files[0].url)).status).toBe(200);
    expect((await authed(request(app).get('/api/bin'), s)).body.items).toEqual([]);
    const pubAfter = await request(app).get(`/api/public/shares/${frontOnlyShareToken}`);
    expect(pubAfter.body.document.files.map((f) => f.id)).toEqual([front.id]);

    const logged = await Activity.findOne({ action: 'document.file.restore' }).lean();
    expect(logged).toMatchObject({ targetType: 'document', meta: { fileId: front.id, name: 'Front', title: 'Aadhaar' } });
    expect(String(logged.documentId)).toBe(docId);
    const deleteLog = await Activity.findOne({ action: 'document.file.delete' }).lean();
    expect(deleteLog.meta).toMatchObject({ fileId: front.id, name: 'Front', title: 'Aadhaar' });
  }, 60000);

  it('the last remaining file still cannot be deleted (400 LAST_FILE), counting only files not in the Bin', async () => {
    const s = await signupFamily(app);
    const { docId, front, back } = await makeTwoFileDocument(s, await makeFolder(s));

    await authed(request(app).delete(`/api/documents/${docId}/files/${front.id}`), s).expect(200);
    const last = await authed(request(app).delete(`/api/documents/${docId}/files/${back.id}`), s);
    expect(last.status).toBe(400);
    expect(last.body.code).toBe('LAST_FILE');
    expect((await rawFile(docId, back.id)).deletedAt).toBeNull();
  });
});

describe('a file whose whole document is later deleted', () => {
  it('stays listed on its own, and restoring it brings the document back too', async () => {
    const s = await signupFamily(app);
    const { docId, front, back } = await makeTwoFileDocument(s, await makeFolder(s));
    await authed(request(app).delete(`/api/documents/${docId}/files/${front.id}`), s).expect(200);
    await authed(request(app).delete(`/api/documents/${docId}`), s).expect(204);

    const bin = await authed(request(app).get('/api/bin'), s);
    const types = bin.body.items.map((i) => i.type).sort();
    expect(types).toEqual(['document', 'file']);
    expect(bin.body.items.find((i) => i.type === 'file')).toMatchObject({ id: front.id, documentDeleted: true });

    const restore = await authed(request(app).post(`/api/bin/file/${front.id}/restore`), s);
    expect(restore.status).toBe(200);
    expect(restore.body.restored.documentRestored).toBe(true);

    const detail = await authed(request(app).get(`/api/documents/${docId}`), s);
    expect(detail.status).toBe(200);
    expect(detail.body.files.map((f) => f.id)).toEqual([front.id, back.id]);
    expect((await authed(request(app).get('/api/bin'), s)).body.items).toEqual([]);
  });

  it('restoring just the document leaves the earlier-deleted file in the Bin, still restorable', async () => {
    const s = await signupFamily(app);
    const { docId, front, back } = await makeTwoFileDocument(s, await makeFolder(s));
    await authed(request(app).delete(`/api/documents/${docId}/files/${front.id}`), s).expect(200);
    await authed(request(app).delete(`/api/documents/${docId}`), s).expect(204);

    await authed(request(app).post(`/api/bin/document/${docId}/restore`), s).expect(200);
    const detail = await authed(request(app).get(`/api/documents/${docId}`), s);
    expect(detail.body.files.map((f) => f.id)).toEqual([back.id]);
    const bin = await authed(request(app).get('/api/bin'), s);
    expect(bin.body.items).toHaveLength(1);
    expect(bin.body.items[0]).toMatchObject({ type: 'file', id: front.id, documentDeleted: false });

    await authed(request(app).post(`/api/bin/file/${front.id}/restore`), s).expect(200);
    const after = await authed(request(app).get(`/api/documents/${docId}`), s);
    expect(after.body.files).toHaveLength(2);
  });
});

describe('purging a file from the Bin (platform admin, via bin/lib.js)', () => {
  it('removes the stored blob and thumbnail and the file entry, and frees its storage', async () => {
    const s = await signupFamily(app);
    const { docId, front, back } = await makeTwoFileDocument(s, await makeFolder(s));
    await authed(request(app).delete(`/api/documents/${docId}/files/${front.id}`), s).expect(200);
    const stored = await rawFile(docId, front.id);
    const storage = await getStorage();
    const before = (await Family.findById(s.familyId).lean()).storageBytes;

    const entry = await findBinEntryFamilyId('file', front.id);
    expect(entry).toEqual({ familyId: s.familyId, name: 'Front' });
    const all = await listBinEntriesAllFamilies();
    expect(all.find((e) => e.id === front.id)).toMatchObject({ type: 'file', familyId: s.familyId, documentId: docId });

    await permanentlyPurgeOne(entry.familyId, 'file', front.id);

    expect(await storage.stat(stored.storageKey)).toBeNull();
    expect(await storage.stat(stored.thumbKey)).toBeNull();
    expect(await rawFile(docId, front.id)).toBeUndefined();
    expect((await Family.findById(s.familyId).lean()).storageBytes).toBeLessThan(before);

    // The rest of the document is untouched.
    const detail = await authed(request(app).get(`/api/documents/${docId}`), s);
    expect(detail.body.files.map((f) => f.id)).toEqual([back.id]);
    expect((await request(app).get(back.url)).status).toBe(200);
    expect((await authed(request(app).get('/api/bin'), s)).body.items).toEqual([]);
    await expect(findBinEntryFamilyId('file', front.id)).rejects.toMatchObject({ code: 'NOT_IN_BIN' });
  });

  it('never purges a file that is not in the Bin', async () => {
    const s = await signupFamily(app);
    const { docId, front } = await makeTwoFileDocument(s, await makeFolder(s));
    await expect(permanentlyPurgeOne(s.familyId, 'file', front.id)).rejects.toMatchObject({ code: 'NOT_IN_BIN' });
    const stored = await rawFile(docId, front.id);
    expect(await (await getStorage()).stat(stored.storageKey)).not.toBeNull();
  });

  it('purging the whole document also removes the blobs of its files already in the Bin', async () => {
    const s = await signupFamily(app);
    const { docId, front } = await makeTwoFileDocument(s, await makeFolder(s));
    await authed(request(app).delete(`/api/documents/${docId}/files/${front.id}`), s).expect(200);
    const stored = await rawFile(docId, front.id);
    await authed(request(app).delete(`/api/documents/${docId}`), s).expect(204);

    await permanentlyPurgeOne(s.familyId, 'document', docId);
    expect(await (await getStorage()).stat(stored.storageKey)).toBeNull();
    expect((await authed(request(app).get('/api/bin'), s)).body.items).toEqual([]);
  });
});

describe('tenant isolation for binned files', () => {
  it('another family can neither see, restore nor purge-in-their-family a file from this family', async () => {
    const s = await signupFamily(app);
    const other = await signupFamily(app);
    const { docId, front } = await makeTwoFileDocument(s, await makeFolder(s));
    await authed(request(app).delete(`/api/documents/${docId}/files/${front.id}`), s).expect(200);

    const otherBin = await authed(request(app).get('/api/bin'), other);
    expect(otherBin.body.items).toEqual([]);

    const restore = await authed(request(app).post(`/api/bin/file/${front.id}/restore`), other);
    expect(restore.status).toBe(404);
    expect(restore.body.code).toBe('NOT_IN_BIN');
    await expect(permanentlyPurgeOne(other.familyId, 'file', front.id)).rejects.toMatchObject({ code: 'NOT_IN_BIN' });

    // Other family can't delete it through the documents route either.
    const del = await authed(request(app).delete(`/api/documents/${docId}/files/${front.id}`), other);
    expect(del.status).toBe(404);

    expect((await rawFile(docId, front.id)).deletedAt).toBeInstanceOf(Date);
    expect((await authed(request(app).get('/api/bin'), s)).body.items).toHaveLength(1);
  });

  it('a read-only member cannot restore a file (403)', async () => {
    const s = await signupFamily(app);
    const { docId, front } = await makeTwoFileDocument(s, await makeFolder(s));
    await authed(request(app).delete(`/api/documents/${docId}/files/${front.id}`), s).expect(200);

    const readerEmail = `reader-${Date.now()}@example.com`;
    await authed(request(app).post('/api/members'), s)
      .send({ name: 'Reader', email: readerEmail, tempPassword: 'password123', access: 'read' })
      .expect(201);
    const login = await request(app).post('/api/auth/login').send({ email: readerEmail, password: 'password123' });

    const res = await request(app)
      .post(`/api/bin/file/${front.id}/restore`)
      .set('Authorization', `Bearer ${login.body.accessToken}`)
      .set('X-Family-Id', s.familyId);
    expect(res.status).toBe(403);
  });
});
