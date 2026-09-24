import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import { MongoMemoryServer } from 'mongodb-memory-server';

let mongod;
let app;
let mongoose;
let Family;
let User;
let Membership;
let Folder;
let Document;
let Share;
let Activity;
let generateOpaqueToken;
let sha256Hex;
let encryptFileBuffer;
let getStorage;
let clearAllLockouts;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();

  process.env.NODE_ENV = 'test';
  process.env.MONGODB_URI = mongod.getUri();
  process.env.CLIENT_URL = 'http://localhost:5173';
  process.env.JWT_ACCESS_SECRET = 'test-access-secret-aaaaaaaaaaaaaaaaaaaa';
  process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-aaaaaaaaaaaaaaaaaaaa';
  process.env.FILE_TOKEN_SECRET = 'test-file-token-secret-aaaaaaaaaaaaaaaaaaaa';
  process.env.FILE_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');
  process.env.FIELD_ENCRYPTION_KEY = Buffer.alloc(32, 9).toString('base64');
  process.env.STORAGE_DRIVER = 'gridfs';

  mongoose = (await import('mongoose')).default;
  const { connectDB } = await import('../src/db/connect.js');
  await connectDB();

  const { createApp } = await import('../src/app.js');
  app = createApp();

  ({ Family } = await import('../src/models/Family.js'));
  ({ User } = await import('../src/models/User.js'));
  ({ Membership } = await import('../src/models/Membership.js'));
  ({ Folder } = await import('../src/models/Folder.js'));
  ({ Document } = await import('../src/models/Document.js'));
  ({ Share } = await import('../src/models/Share.js'));
  ({ Activity } = await import('../src/models/Activity.js'));
  ({ generateOpaqueToken, sha256Hex, encryptFileBuffer } = await import('../src/utils/crypto.js'));
  ({ getStorage } = await import('../src/storage/index.js'));
  ({ _clearAllLockouts: clearAllLockouts } = await import('../src/modules/public/lockout.js'));
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

beforeEach(async () => {
  await mongoose.connection.dropDatabase();
  clearAllLockouts();
});

let uniqueCounter = 0;
function uniq(prefix) {
  uniqueCounter += 1;
  return `${prefix}-${Date.now()}-${uniqueCounter}`;
}

async function createFamily(name = 'Test Family') {
  const user = await User.create({ name: 'Owner', email: `${uniq('user')}@test.com`, passwordHash: 'x' });
  const family = await Family.create({ name, slug: uniq('family'), createdBy: user._id });
  const membership = await Membership.create({
    familyId: family._id,
    userId: user._id,
    name: 'Owner',
    role: 'admin',
    access: 'write',
    isOwner: true,
  });
  return { user, family, membership };
}

async function createFolder(family, membership, overrides = {}) {
  return Folder.create({
    familyId: family._id,
    name: overrides.name || 'Folder A',
    parentId: overrides.parentId ?? null,
    createdBy: membership._id,
  });
}

async function createDocumentWithFile(family, membership, folder, { title = 'Passport', content = 'hello world' } = {}) {
  const storage = await getStorage();
  const plaintext = Buffer.from(content);
  const { ciphertext, encryption } = encryptFileBuffer(plaintext);
  const storageKey = uniq('files/test');
  await storage.put(storageKey, ciphertext);

  const doc = await Document.create({
    familyId: family._id,
    folderId: folder._id,
    title,
    createdBy: membership._id,
    files: [
      {
        label: 'Front',
        order: 0,
        storageKey,
        thumbKey: null,
        originalName: 'front.txt',
        mimeType: 'text/plain',
        size: plaintext.length,
        encryption,
        uploadedBy: membership._id,
      },
    ],
  });
  return { doc, plaintext };
}

async function createShare(family, targetType, targetId, overrides = {}) {
  const token = generateOpaqueToken(32);
  const tokenHash = sha256Hex(token);
  const passwordHash = overrides.password ? await bcrypt.hash(overrides.password, 12) : null;
  const share = await Share.create({
    familyId: family._id,
    tokenHash,
    targetType,
    targetId,
    label: overrides.label || '',
    expiresAt: overrides.expiresAt ?? null,
    allowDownload: overrides.allowDownload ?? true,
    includeSensitive: overrides.includeSensitive ?? false,
    passwordHash,
    revokedAt: overrides.revokedAt ?? null,
    fileIds: overrides.fileIds,
    createdBy: overrides.createdBy || new mongoose.Types.ObjectId(),
  });
  return { share, token };
}

describe('public module', () => {
  describe('GET /api/public/shares/:token', () => {
    it('404s for an unknown token', async () => {
      const res = await request(app).get('/api/public/shares/does-not-exist');
      expect(res.status).toBe(404);
    });

    it('returns a document share and bumps openCount/lastOpenedAt, logs share.open', async () => {
      const { family, membership } = await createFamily('The Singhs');
      const folder = await createFolder(family, membership);
      const { doc } = await createDocumentWithFile(family, membership, folder);
      const { share, token } = await createShare(family, 'document', doc._id, { createdBy: membership._id });

      const res = await request(app).get(`/api/public/shares/${token}`);
      expect(res.status).toBe(200);
      expect(res.body.familyName).toBe('The Singhs');
      expect(res.body.targetType).toBe('document');
      expect(res.body.document.title).toBe('Passport');
      expect(res.body.document.files).toHaveLength(1);
      expect(res.body.document.files[0].url).toContain('/api/files/');
      expect(res.body.document.files[0]).not.toHaveProperty('storageKey');
      expect(res.body.document.files[0]).not.toHaveProperty('thumbKey');
      expect(res.body.document.files[0]).not.toHaveProperty('encryption');

      const updated = await Share.findById(share._id);
      expect(updated.openCount).toBe(1);
      expect(updated.lastOpenedAt).toBeTruthy();

      const opens = await Activity.find({ shareId: share._id, action: 'share.open' });
      expect(opens).toHaveLength(1);
    });

    it('returns a folder share as a recursive folderTree', async () => {
      const { family, membership } = await createFamily();
      const root = await createFolder(family, membership, { name: 'Root' });
      const child = await createFolder(family, membership, { name: 'Child', parentId: root._id });
      await createDocumentWithFile(family, membership, root, { title: 'Doc In Root' });
      await createDocumentWithFile(family, membership, child, { title: 'Doc In Child' });

      const { token } = await createShare(family, 'folder', root._id, { createdBy: membership._id });

      const res = await request(app).get(`/api/public/shares/${token}`);
      expect(res.status).toBe(200);
      expect(res.body.targetType).toBe('folder');
      expect(res.body.folderTree.name).toBe('Root');
      expect(res.body.folderTree.documents.map((d) => d.title)).toContain('Doc In Root');
      expect(res.body.folderTree.subfolders).toHaveLength(1);
      expect(res.body.folderTree.subfolders[0].name).toBe('Child');
      expect(res.body.folderTree.subfolders[0].documents.map((d) => d.title)).toContain('Doc In Child');
    });

    it('404s an item share while the Items module is still a stub', async () => {
      const { family } = await createFamily();
      const fakeItemId = new mongoose.Types.ObjectId();
      const { token } = await createShare(family, 'item', fakeItemId);

      const res = await request(app).get(`/api/public/shares/${token}`);
      expect(res.status).toBe(404);
    });

    it('410s a revoked share', async () => {
      const { family, membership } = await createFamily();
      const folder = await createFolder(family, membership);
      const { doc } = await createDocumentWithFile(family, membership, folder);
      const { token } = await createShare(family, 'document', doc._id, { revokedAt: new Date() });

      const res = await request(app).get(`/api/public/shares/${token}`);
      expect(res.status).toBe(410);
      expect(res.body.code).toBe('REVOKED');
    });

    it('410s an expired share', async () => {
      const { family, membership } = await createFamily();
      const folder = await createFolder(family, membership);
      const { doc } = await createDocumentWithFile(family, membership, folder);
      const { token } = await createShare(family, 'document', doc._id, {
        expiresAt: new Date(Date.now() - 60_000),
      });

      const res = await request(app).get(`/api/public/shares/${token}`);
      expect(res.status).toBe(410);
      expect(res.body.code).toBe('EXPIRED');
    });
  });

  describe('password protection + lockout', () => {
    it('requires the password header, rejects wrong passwords, and accepts the right one', async () => {
      const { family, membership } = await createFamily();
      const folder = await createFolder(family, membership);
      const { doc } = await createDocumentWithFile(family, membership, folder);
      const { token } = await createShare(family, 'document', doc._id, { password: 'correct-horse' });
      // bcrypt cost-12 compares are CPU-heavy; under full-suite concurrent load (many test files'
      // own mongodb-memory-server + other agents' bcrypt work running at once) this can exceed
      // vitest's default 5s timeout even though it's fast in isolation.

      const noPassword = await request(app).get(`/api/public/shares/${token}`);
      expect(noPassword.status).toBe(401);
      expect(noPassword.body.code).toBe('PASSWORD_REQUIRED');

      const wrongPassword = await request(app)
        .get(`/api/public/shares/${token}`)
        .set('X-Share-Password', 'nope');
      expect(wrongPassword.status).toBe(401);
      expect(wrongPassword.body.code).toBe('PASSWORD_INVALID');

      const rightPassword = await request(app)
        .get(`/api/public/shares/${token}`)
        .set('X-Share-Password', 'correct-horse');
      expect(rightPassword.status).toBe(200);
    }, 20000);

    it('locks out after 5 wrong passwords within the window (429 TOO_MANY_ATTEMPTS)', async () => {
      const { family, membership } = await createFamily();
      const folder = await createFolder(family, membership);
      const { doc } = await createDocumentWithFile(family, membership, folder);
      const { token } = await createShare(family, 'document', doc._id, { password: 'correct-horse' });

      for (let i = 0; i < 5; i += 1) {
        // eslint-disable-next-line no-await-in-loop
        const res = await request(app).get(`/api/public/shares/${token}`).set('X-Share-Password', 'nope');
        expect(res.status).toBe(401);
        expect(res.body.code).toBe('PASSWORD_INVALID');
      }

      const sixth = await request(app).get(`/api/public/shares/${token}`).set('X-Share-Password', 'nope');
      expect(sixth.status).toBe(429);
      expect(sixth.body.code).toBe('TOO_MANY_ATTEMPTS');

      // Even the CORRECT password is blocked while locked out.
      const evenCorrect = await request(app)
        .get(`/api/public/shares/${token}`)
        .set('X-Share-Password', 'correct-horse');
      expect(evenCorrect.status).toBe(429);

      const failedLogs = await Activity.find({ action: 'share.password_failed' });
      expect(failedLogs.length).toBeGreaterThanOrEqual(5);
    }, 20000);
  });

  describe('POST /api/public/shares/:token/zip-link', () => {
    it('streams a zip of the shared document files and bumps downloadCount', async () => {
      const { family, membership } = await createFamily();
      const folder = await createFolder(family, membership);
      const { doc } = await createDocumentWithFile(family, membership, folder, { content: 'zip me please' });
      const { share, token } = await createShare(family, 'document', doc._id, { createdBy: membership._id });

      const res = await request(app).post(`/api/public/shares/${token}/zip-link`);
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('application/zip');
      expect(res.text.slice(0, 2)).toBe('PK'); // zip local file header magic

      const updated = await Share.findById(share._id);
      expect(updated.downloadCount).toBe(1);

      const downloads = await Activity.find({ shareId: share._id, action: 'share.download' });
      expect(downloads).toHaveLength(1);
    });

    it('403s when allowDownload is false', async () => {
      const { family, membership } = await createFamily();
      const folder = await createFolder(family, membership);
      const { doc } = await createDocumentWithFile(family, membership, folder);
      const { token } = await createShare(family, 'document', doc._id, { allowDownload: false });

      const res = await request(app).post(`/api/public/shares/${token}/zip-link`);
      expect(res.status).toBe(403);
    });
  });

  describe('tenant isolation via tokens', () => {
    it("a token minted for family A's document never surfaces family B data", async () => {
      const familyA = await createFamily('Family A');
      const folderA = await createFolder(familyA.family, familyA.membership);
      const { doc: docA } = await createDocumentWithFile(familyA.family, familyA.membership, folderA);
      const { token } = await createShare(familyA.family, 'document', docA._id, { createdBy: familyA.membership._id });

      await createFamily('Family B'); // exists in the DB alongside family A

      const res = await request(app).get(`/api/public/shares/${token}`);
      expect(res.status).toBe(200);
      expect(res.body.familyName).toBe('Family A');
    });

    it('a tampered token is rejected, not silently matched to another share', async () => {
      const { family, membership } = await createFamily();
      const folder = await createFolder(family, membership);
      const { doc } = await createDocumentWithFile(family, membership, folder);
      const { token } = await createShare(family, 'document', doc._id);

      const tampered = `${token.slice(0, -1)}${token.at(-1) === 'a' ? 'b' : 'a'}`;
      const res = await request(app).get(`/api/public/shares/${tampered}`);
      expect(res.status).toBe(404);
    });
  });
});
