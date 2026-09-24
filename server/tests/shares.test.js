import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';

// All app-side modules (anything that transitively imports src/config/env.js) are loaded via
// dynamic import AFTER we've set every required env var below — env.js validates process.env at
// module-evaluation time, so it must never be imported before that. This keeps this suite fully
// self-contained (no dependency on a local .env file), which is what makes it CI-portable.
let mongod;
let app;
let mongoose;
let Family;
let User;
let Membership;
let Folder;
let Document;
let Share;
let signAccessToken;

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
  ({ signAccessToken } = await import('../src/utils/tokens.js'));
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

beforeEach(async () => {
  await mongoose.connection.dropDatabase();
});

let uniqueCounter = 0;
function uniq(prefix) {
  uniqueCounter += 1;
  return `${prefix}-${Date.now()}-${uniqueCounter}`;
}

async function createFamilyWithMember(role = 'admin', access = 'write') {
  const user = await User.create({ name: 'Test User', email: `${uniq('user')}@test.com`, passwordHash: 'x' });
  const family = await Family.create({ name: 'Test Family', slug: uniq('family'), createdBy: user._id });
  const membership = await Membership.create({
    familyId: family._id,
    userId: user._id,
    name: user.name,
    role,
    access,
    isOwner: role === 'admin',
    canLogin: true,
  });
  // Multi-family sessions (docs/API.md): the access token only proves WHO is calling — `which
  // family` now comes from the X-Family-Id header, resolved server-side against this Membership.
  const accessToken = signAccessToken({ userId: user._id });
  return { user, family, membership, accessToken };
}

async function createFolder(family, membership, overrides = {}) {
  return Folder.create({
    familyId: family._id,
    name: overrides.name || 'Folder A',
    parentId: overrides.parentId ?? null,
    createdBy: membership._id,
  });
}

async function createDocument(family, membership, folder, overrides = {}) {
  return Document.create({
    familyId: family._id,
    folderId: folder._id,
    title: overrides.title || 'Passport',
    createdBy: membership._id,
    files: overrides.files || [],
  });
}

describe('shares module', () => {
  describe('POST /api/shares — invariants', () => {
    it('rejects includeSensitive:true without a password', async () => {
      const { family, membership, accessToken } = await createFamilyWithMember();
      const folder = await createFolder(family, membership);
      const doc = await createDocument(family, membership, folder);

      const res = await request(app)
        .post('/api/shares')
        .set('Authorization', `Bearer ${accessToken}`).set('X-Family-Id', family.id)
        .send({ targetType: 'document', targetId: doc.id, expiresIn: '24h', includeSensitive: true });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('INVALID_SENSITIVE_SHARE');
    });

    it('rejects includeSensitive:true with a password but an expiry over 24h', async () => {
      const { family, membership, accessToken } = await createFamilyWithMember();
      const folder = await createFolder(family, membership);
      const doc = await createDocument(family, membership, folder);

      const res = await request(app)
        .post('/api/shares')
        .set('Authorization', `Bearer ${accessToken}`).set('X-Family-Id', family.id)
        .send({
          targetType: 'document',
          targetId: doc.id,
          expiresIn: '7d',
          password: 'secret123',
          includeSensitive: true,
        });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('INVALID_SENSITIVE_SHARE');
    });

    it('rejects includeSensitive:true with expiresIn "never"', async () => {
      const { family, membership, accessToken } = await createFamilyWithMember();
      const folder = await createFolder(family, membership);
      const doc = await createDocument(family, membership, folder);

      const res = await request(app)
        .post('/api/shares')
        .set('Authorization', `Bearer ${accessToken}`).set('X-Family-Id', family.id)
        .send({
          targetType: 'document',
          targetId: doc.id,
          expiresIn: 'never',
          password: 'secret123',
          includeSensitive: true,
        });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('INVALID_SENSITIVE_SHARE');
    });

    it('allows includeSensitive:true with a password and a <=24h expiry', async () => {
      const { family, membership, accessToken } = await createFamilyWithMember();
      const folder = await createFolder(family, membership);
      const doc = await createDocument(family, membership, folder);

      const res = await request(app)
        .post('/api/shares')
        .set('Authorization', `Bearer ${accessToken}`).set('X-Family-Id', family.id)
        .send({
          targetType: 'document',
          targetId: doc.id,
          expiresIn: '1h',
          password: 'secret123',
          includeSensitive: true,
        });

      expect(res.status).toBe(201);
      expect(res.body.includeSensitive).toBe(true);
      expect(res.body.hasPassword).toBe(true);
      expect(res.body.url).toMatch(/^http:\/\/localhost:5173\/s\//);
    });

    it('never allows includeSensitive:true on a folder share, even with password + short expiry', async () => {
      const { family, membership, accessToken } = await createFamilyWithMember();
      const folder = await createFolder(family, membership);

      const res = await request(app)
        .post('/api/shares')
        .set('Authorization', `Bearer ${accessToken}`).set('X-Family-Id', family.id)
        .send({
          targetType: 'folder',
          targetId: folder.id,
          expiresIn: '1h',
          password: 'secret123',
          includeSensitive: true,
        });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('FOLDER_SHARE_NO_SENSITIVE');
    });

    it('404s when the target document does not exist in the caller family', async () => {
      const { family, accessToken } = await createFamilyWithMember();
      const fakeId = new mongoose.Types.ObjectId().toString();

      const res = await request(app)
        .post('/api/shares')
        .set('Authorization', `Bearer ${accessToken}`)
        .set('X-Family-Id', family.id)
        .send({ targetType: 'document', targetId: fakeId, expiresIn: '24h' });

      expect(res.status).toBe(404);
    });

    it('returns the raw token URL only on create; list/detail omit it', async () => {
      const { family, membership, accessToken } = await createFamilyWithMember();
      const folder = await createFolder(family, membership);
      const doc = await createDocument(family, membership, folder);

      const created = await request(app)
        .post('/api/shares')
        .set('Authorization', `Bearer ${accessToken}`).set('X-Family-Id', family.id)
        .send({ targetType: 'document', targetId: doc.id, expiresIn: '24h' });
      expect(created.status).toBe(201);
      expect(created.body.url).toBeTruthy();

      const listed = await request(app).get('/api/shares').set('Authorization', `Bearer ${accessToken}`).set('X-Family-Id', family.id);
      expect(listed.status).toBe(200);
      expect(listed.body.items).toHaveLength(1);
      expect(listed.body.items[0].url).toBeUndefined();
      expect(listed.body.items[0].targetLabel).toBe('Passport');
    });
  });

  describe('access control', () => {
    it('401s with no bearer token', async () => {
      const res = await request(app).get('/api/shares');
      expect(res.status).toBe(401);
    });

    it('403s a read-only member trying to create a share', async () => {
      const { family, membership, accessToken } = await createFamilyWithMember('member', 'read');
      const folder = await createFolder(family, membership);
      const doc = await createDocument(family, membership, folder);

      const res = await request(app)
        .post('/api/shares')
        .set('Authorization', `Bearer ${accessToken}`).set('X-Family-Id', family.id)
        .send({ targetType: 'document', targetId: doc.id, expiresIn: '24h' });

      expect(res.status).toBe(403);
    });

    it('only the creator or an admin can DELETE a share', async () => {
      const { family, membership: adminMembership, accessToken: adminToken } = await createFamilyWithMember(
        'admin',
        'write',
      );
      const folder = await createFolder(family, adminMembership);
      const doc = await createDocument(family, adminMembership, folder);

      const created = await request(app)
        .post('/api/shares')
        .set('Authorization', `Bearer ${adminToken}`)
        .set('X-Family-Id', family.id)
        .send({ targetType: 'document', targetId: doc.id, expiresIn: '24h' });
      const shareId = created.body.id;

      // A second write-access, non-admin, non-creator member of the SAME family.
      const otherUser = await User.create({ name: 'Other', email: `${uniq('user')}@test.com`, passwordHash: 'x' });
      const otherMembership = await Membership.create({
        familyId: family._id,
        userId: otherUser._id,
        name: 'Other',
        role: 'member',
        access: 'write',
        canLogin: true,
      });
      const otherToken = signAccessToken({ userId: otherUser._id });

      const forbidden = await request(app)
        .delete(`/api/shares/${shareId}`)
        .set('Authorization', `Bearer ${otherToken}`)
        .set('X-Family-Id', family.id);
      expect(forbidden.status).toBe(403);

      const allowed = await request(app)
        .delete(`/api/shares/${shareId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .set('X-Family-Id', family.id);
      expect(allowed.status).toBe(204);
    });
  });

  describe('PATCH /api/shares/:id', () => {
    it('revokes a share and it drops out of status=active', async () => {
      const { family, membership, accessToken } = await createFamilyWithMember();
      const folder = await createFolder(family, membership);
      const doc = await createDocument(family, membership, folder);

      const created = await request(app)
        .post('/api/shares')
        .set('Authorization', `Bearer ${accessToken}`).set('X-Family-Id', family.id)
        .send({ targetType: 'document', targetId: doc.id, expiresIn: '24h' });
      const shareId = created.body.id;

      const patched = await request(app)
        .patch(`/api/shares/${shareId}`)
        .set('Authorization', `Bearer ${accessToken}`).set('X-Family-Id', family.id)
        .send({ revoke: true });
      expect(patched.status).toBe(200);
      expect(patched.body.revokedAt).toBeTruthy();

      const activeList = await request(app)
        .get('/api/shares?status=active')
        .set('Authorization', `Bearer ${accessToken}`).set('X-Family-Id', family.id);
      expect(activeList.body.items).toHaveLength(0);

      const revokedList = await request(app)
        .get('/api/shares?status=revoked')
        .set('Authorization', `Bearer ${accessToken}`).set('X-Family-Id', family.id);
      expect(revokedList.body.items).toHaveLength(1);
    });

    it('extends expiry via an expiresIn code and via an ISO date', async () => {
      const { family, membership, accessToken } = await createFamilyWithMember();
      const folder = await createFolder(family, membership);
      const doc = await createDocument(family, membership, folder);

      const created = await request(app)
        .post('/api/shares')
        .set('Authorization', `Bearer ${accessToken}`).set('X-Family-Id', family.id)
        .send({ targetType: 'document', targetId: doc.id, expiresIn: '1h' });
      const shareId = created.body.id;

      const extended = await request(app)
        .patch(`/api/shares/${shareId}`)
        .set('Authorization', `Bearer ${accessToken}`).set('X-Family-Id', family.id)
        .send({ extendTo: '30d' });
      expect(extended.status).toBe(200);
      expect(new Date(extended.body.expiresAt).getTime()).toBeGreaterThan(Date.now() + 20 * 24 * 60 * 60 * 1000);

      const isoDate = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();
      const extended2 = await request(app)
        .patch(`/api/shares/${shareId}`)
        .set('Authorization', `Bearer ${accessToken}`).set('X-Family-Id', family.id)
        .send({ extendTo: isoDate });
      expect(extended2.status).toBe(200);
      expect(new Date(extended2.body.expiresAt).toISOString()).toBe(isoDate);
    });
  });

  describe('tenant isolation', () => {
    it('family B cannot list, read, patch or delete family A shares', async () => {
      const familyA = await createFamilyWithMember();
      const folderA = await createFolder(familyA.family, familyA.membership);
      const docA = await createDocument(familyA.family, familyA.membership, folderA);

      const created = await request(app)
        .post('/api/shares')
        .set('Authorization', `Bearer ${familyA.accessToken}`)
        .set('X-Family-Id', familyA.family.id)
        .send({ targetType: 'document', targetId: docA.id, expiresIn: '24h' });
      const shareId = created.body.id;

      const familyB = await createFamilyWithMember();

      const listB = await request(app)
        .get('/api/shares')
        .set('Authorization', `Bearer ${familyB.accessToken}`)
        .set('X-Family-Id', familyB.family.id);
      expect(listB.status).toBe(200);
      expect(listB.body.items).toHaveLength(0);

      const patchB = await request(app)
        .patch(`/api/shares/${shareId}`)
        .set('Authorization', `Bearer ${familyB.accessToken}`)
        .set('X-Family-Id', familyB.family.id)
        .send({ revoke: true });
      expect(patchB.status).toBe(404);

      const deleteB = await request(app)
        .delete(`/api/shares/${shareId}`)
        .set('Authorization', `Bearer ${familyB.accessToken}`)
        .set('X-Family-Id', familyB.family.id);
      expect(deleteB.status).toBe(404);

      // The share must be untouched by family B's failed attempts.
      const stillThere = await Share.findById(shareId);
      expect(stillThere.revokedAt).toBeNull();
    });

    it('X-Family-Id header itself is validated: missing header is 400, a family the caller is not a member of is 403', async () => {
      const familyA = await createFamilyWithMember();

      const missingHeader = await request(app)
        .get('/api/shares')
        .set('Authorization', `Bearer ${familyA.accessToken}`);
      expect(missingHeader.status).toBe(400);
      expect(missingHeader.body.code).toBe('MISSING_FAMILY_ID');

      const familyB = await createFamilyWithMember();
      const wrongFamily = await request(app)
        .get('/api/shares')
        .set('Authorization', `Bearer ${familyA.accessToken}`)
        .set('X-Family-Id', familyB.family.id);
      expect(wrongFamily.status).toBe(403);
      expect(wrongFamily.body.code).toBe('NOT_A_MEMBER');
    });
  });
});
