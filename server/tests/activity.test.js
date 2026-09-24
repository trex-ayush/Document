import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';

let mongod;
let app;
let mongoose;
let Family;
let User;
let Membership;
let Activity;
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
  ({ Activity } = await import('../src/models/Activity.js'));
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
  });
  // Multi-family sessions (docs/API.md): the access token only proves WHO is calling — `which
  // family` now comes from the X-Family-Id header, resolved server-side against this Membership.
  const accessToken = signAccessToken({ userId: user._id });
  return { user, family, membership, accessToken };
}

async function seedActivity(family, membership, count, { action = 'document.view', stepMs = 1000 } = {}) {
  const base = Date.now() - count * stepMs;
  const rows = [];
  for (let i = 0; i < count; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    const row = await Activity.create({
      familyId: family._id,
      actorMembershipId: membership._id,
      actorName: membership.name,
      action,
      createdAt: new Date(base + i * stepMs),
      // `expiresAt` is normally computed at write time by services/activityLogger.js from the
      // family's `settings.activityRetentionDays` (src/models/Activity.js) — this helper bypasses
      // that service to seed fixtures directly, so it supplies its own far-future value; these
      // tests don't exercise retention/TTL behavior at all.
      expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
    });
    rows.push(row);
  }
  return rows;
}

describe('activity module', () => {
  it('401s with no bearer token', async () => {
    const res = await request(app).get('/api/activity');
    expect(res.status).toBe(401);
  });

  it('403s a read-only member', async () => {
    const { family, accessToken } = await createFamilyWithMember('member', 'read');
    const res = await request(app)
      .get('/api/activity')
      .set('Authorization', `Bearer ${accessToken}`)
      .set('X-Family-Id', family.id);
    expect(res.status).toBe(403);
  });

  it('lists activity for the caller family, newest first', async () => {
    const { family, membership, accessToken } = await createFamilyWithMember();
    await seedActivity(family, membership, 3);

    const res = await request(app).get('/api/activity').set('Authorization', `Bearer ${accessToken}`).set('X-Family-Id', family.id);
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(3);
    const times = res.body.items.map((i) => new Date(i.createdAt).getTime());
    expect(times).toEqual([...times].sort((a, b) => b - a));
    expect(res.body.items[0]).not.toHaveProperty('familyId');
    expect(res.body.items[0]).not.toHaveProperty('ipHash');
  });

  it('paginates via cursor with no overlap or gaps', async () => {
    const { family, membership, accessToken } = await createFamilyWithMember();
    await seedActivity(family, membership, 5);

    const page1 = await request(app)
      .get('/api/activity?limit=2')
      .set('Authorization', `Bearer ${accessToken}`).set('X-Family-Id', family.id);
    expect(page1.body.items).toHaveLength(2);
    expect(page1.body.nextCursor).toBeTruthy();

    const page2 = await request(app)
      .get(`/api/activity?limit=2&cursor=${encodeURIComponent(page1.body.nextCursor)}`)
      .set('Authorization', `Bearer ${accessToken}`).set('X-Family-Id', family.id);
    expect(page2.body.items).toHaveLength(2);
    expect(page2.body.nextCursor).toBeTruthy();

    const page3 = await request(app)
      .get(`/api/activity?limit=2&cursor=${encodeURIComponent(page2.body.nextCursor)}`)
      .set('Authorization', `Bearer ${accessToken}`).set('X-Family-Id', family.id);
    expect(page3.body.items).toHaveLength(1);
    expect(page3.body.nextCursor).toBeNull();

    const allIds = [...page1.body.items, ...page2.body.items, ...page3.body.items].map((i) => i.id);
    expect(new Set(allIds).size).toBe(5);
  });

  it('filters by action', async () => {
    const { family, membership, accessToken } = await createFamilyWithMember();
    await seedActivity(family, membership, 2, { action: 'document.view' });
    await seedActivity(family, membership, 1, { action: 'share.open' });

    const res = await request(app)
      .get('/api/activity?action=share.open')
      .set('Authorization', `Bearer ${accessToken}`).set('X-Family-Id', family.id);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].action).toBe('share.open');
  });

  it('filters by memberId', async () => {
    const { family, membership, accessToken } = await createFamilyWithMember();
    await seedActivity(family, membership, 2);

    const otherUser = await User.create({ name: 'Other', email: `${uniq('user')}@test.com`, passwordHash: 'x' });
    const otherMembership = await Membership.create({
      familyId: family._id,
      userId: otherUser._id,
      name: 'Other',
      role: 'member',
      access: 'write',
    });
    await seedActivity(family, otherMembership, 3);

    const res = await request(app)
      .get(`/api/activity?memberId=${membership._id}`)
      .set('Authorization', `Bearer ${accessToken}`).set('X-Family-Id', family.id);
    expect(res.body.items).toHaveLength(2);
  });

  it('tenant isolation: family B sees none of family A activity', async () => {
    const familyA = await createFamilyWithMember();
    await seedActivity(familyA.family, familyA.membership, 4);

    const familyB = await createFamilyWithMember();
    const res = await request(app)
      .get('/api/activity')
      .set('Authorization', `Bearer ${familyB.accessToken}`)
      .set('X-Family-Id', familyB.family.id);
    expect(res.body.items).toHaveLength(0);
  });

  it('X-Family-Id header itself is validated: missing header is 400, a family the caller is not a member of is 403', async () => {
    const familyA = await createFamilyWithMember();

    const missingHeader = await request(app)
      .get('/api/activity')
      .set('Authorization', `Bearer ${familyA.accessToken}`);
    expect(missingHeader.status).toBe(400);
    expect(missingHeader.body.code).toBe('MISSING_FAMILY_ID');

    const familyB = await createFamilyWithMember();
    const wrongFamily = await request(app)
      .get('/api/activity')
      .set('Authorization', `Bearer ${familyA.accessToken}`)
      .set('X-Family-Id', familyB.family.id);
    expect(wrongFamily.status).toBe(403);
    expect(wrongFamily.body.code).toBe('NOT_A_MEMBER');
  });
});
