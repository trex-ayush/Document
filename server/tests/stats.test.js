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
let VaultItem;
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
  ({ VaultItem } = await import('../src/models/VaultItem.js'));
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
  // Multi-family sessions (docs/API.md): the access token only proves WHO is calling — `which
  // family` now comes from the X-Family-Id header, resolved server-side against this Membership.
  const accessToken = signAccessToken({ userId: user._id });
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
    deletedAt: overrides.deletedAt ?? null,
  });
}

async function createItem(family, membership, folder, kind, overrides = {}) {
  return VaultItem.create({
    familyId: family._id,
    folderId: folder._id,
    kind,
    title: overrides.title || kind,
    createdBy: membership._id,
    deletedAt: overrides.deletedAt ?? null,
  });
}

const getStats = (s) =>
  request(app).get('/api/stats').set('Authorization', `Bearer ${s.accessToken}`).set('X-Family-Id', s.family.id);

describe('stats module', () => {
  it('401s with no bearer token', async () => {
    const res = await request(app).get('/api/stats');
    expect(res.status).toBe(401);
  });

  it('returns just the five Home counts, excluding the bin', async () => {
    const s = await createFamilyWithMember(12345);
    const { family, membership } = s;
    const folder = await createFolder(family, membership);
    await createDocument(family, membership, folder);
    await createDocument(family, membership, folder);
    await createDocument(family, membership, folder, { deletedAt: new Date() });
    await createItem(family, membership, folder, 'login');
    await createItem(family, membership, folder, 'login');
    await createItem(family, membership, folder, 'login', { deletedAt: new Date() });
    await createItem(family, membership, folder, 'note');
    await Folder.create({ familyId: family._id, name: 'Gone', createdBy: membership._id, deletedAt: new Date() });
    await Membership.create({ familyId: family._id, name: 'Rahul', invitedEmail: 'rahul@test.com', status: 'invited' });

    const res = await getStats(s);
    expect(res.status).toBe(200);
    // folders = Folder A + the Shared system folder
    expect(res.body).toEqual({ counts: { documents: 2, passwords: 2, notes: 1, folders: 2, members: 2 } });
  });

  it('a brand-new family has just the Shared folder', async () => {
    const s = await createFamilyWithMember();
    const res = await getStats(s);
    expect(res.body.counts).toEqual({ documents: 0, passwords: 0, notes: 0, folders: 1, members: 1 });
  });

  it('tenant isolation: family B stats never include family A data', async () => {
    const familyA = await createFamilyWithMember(999);
    const folderA = await createFolder(familyA.family, familyA.membership);
    await createDocument(familyA.family, familyA.membership, folderA);

    await createItem(familyA.family, familyA.membership, folderA, 'login');

    const familyB = await createFamilyWithMember(0);

    const res = await getStats(familyB);
    expect(res.body.counts).toEqual({ documents: 0, passwords: 0, notes: 0, folders: 1, members: 1 });
  });

  it('X-Family-Id header itself is validated: missing header is 400, a family the caller is not a member of is 403', async () => {
    const familyA = await createFamilyWithMember();

    const missingHeader = await request(app)
      .get('/api/stats')
      .set('Authorization', `Bearer ${familyA.accessToken}`);
    expect(missingHeader.status).toBe(400);
    expect(missingHeader.body.code).toBe('MISSING_FAMILY_ID');

    const familyB = await createFamilyWithMember();
    const wrongFamily = await request(app)
      .get('/api/stats')
      .set('Authorization', `Bearer ${familyA.accessToken}`)
      .set('X-Family-Id', familyB.family.id);
    expect(wrongFamily.status).toBe(403);
    expect(wrongFamily.body.code).toBe('NOT_A_MEMBER');
  });
});
