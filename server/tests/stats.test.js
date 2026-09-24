import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
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
let signAccessToken;
let generateOpaqueToken;
let sha256Hex;

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
  ({ generateOpaqueToken, sha256Hex } = await import('../src/utils/crypto.js'));
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

async function createFamilyWithMember(storageBytes = 0) {
  const user = await User.create({ name: 'Test User', email: `${uniq('user')}@test.com`, passwordHash: 'x' });
  const family = await Family.create({ name: 'Test Family', slug: uniq('family'), createdBy: user._id, storageBytes });
  const membership = await Membership.create({
    familyId: family._id,
    userId: user._id,
    name: user.name,
    role: 'admin',
    access: 'write',
    isOwner: true,
  });
  const accessToken = signAccessToken({
    userId: user._id,
    membershipId: membership._id,
    familyId: family._id,
    role: membership.role,
    access: membership.access,
  });
  return { user, family, membership, accessToken };
}

async function createFolder(family, membership, name = 'Folder A') {
  return Folder.create({ familyId: family._id, name, parentId: null, createdBy: membership._id });
}

async function createDocument(family, membership, folder, overrides = {}) {
  return Document.create({
    familyId: family._id,
    folderId: folder._id,
    title: overrides.title || 'Doc',
    createdBy: membership._id,
    expiryDate: overrides.expiryDate ?? null,
  });
}

async function createActiveShare(family, membership, targetId) {
  const token = generateOpaqueToken(16);
  return Share.create({
    familyId: family._id,
    tokenHash: sha256Hex(token),
    targetType: 'document',
    targetId,
    expiresAt: null,
    createdBy: membership._id,
  });
}

describe('stats module', () => {
  it('401s with no bearer token', async () => {
    const res = await request(app).get('/api/stats');
    expect(res.status).toBe(401);
  });

  it('returns counts, itemsByKind stub, and honors Family.storageBytes', async () => {
    const { family, membership, accessToken } = await createFamilyWithMember(12345);
    const folder = await createFolder(family, membership);
    await createDocument(family, membership, folder);
    await createDocument(family, membership, folder);
    const doc3 = await createDocument(family, membership, folder);
    await createActiveShare(family, membership, doc3._id);

    const res = await request(app).get('/api/stats').set('Authorization', `Bearer ${accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.counts.documents).toBe(3);
    expect(res.body.counts.folders).toBe(1);
    expect(res.body.counts.members).toBe(1);
    expect(res.body.counts.activeShares).toBe(1);
    expect(res.body.counts.storageBytes).toBe(12345);
    expect(res.body.counts.storageLimitBytes).toBeNull();
    expect(res.body.itemsByKind).toEqual({});
  });

  it('expiringSoon includes documents within 60 days but not past-expired or far-future ones', async () => {
    const { family, membership, accessToken } = await createFamilyWithMember();
    const folder = await createFolder(family, membership);

    const inWindow = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    const tooFar = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);
    const alreadyExpired = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);

    await createDocument(family, membership, folder, { title: 'Soon', expiryDate: inWindow });
    await createDocument(family, membership, folder, { title: 'Far', expiryDate: tooFar });
    await createDocument(family, membership, folder, { title: 'Expired', expiryDate: alreadyExpired });
    await createDocument(family, membership, folder, { title: 'NoExpiry' });

    const res = await request(app).get('/api/stats').set('Authorization', `Bearer ${accessToken}`);
    const titles = res.body.expiringSoon.map((d) => d.title);
    expect(titles).toEqual(['Soon']);
  });

  it('tenant isolation: family B stats never include family A data', async () => {
    const familyA = await createFamilyWithMember(999);
    const folderA = await createFolder(familyA.family, familyA.membership);
    await createDocument(familyA.family, familyA.membership, folderA);

    const familyB = await createFamilyWithMember(0);

    const res = await request(app).get('/api/stats').set('Authorization', `Bearer ${familyB.accessToken}`);
    expect(res.body.counts.documents).toBe(0);
    expect(res.body.counts.folders).toBe(0);
    expect(res.body.counts.storageBytes).toBe(0);
  });
});
