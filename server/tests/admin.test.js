import './helpers/setupPlatformOwnerEnv.js';
import './helpers/setupEnv.js';
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import { startTestDb, stopTestDb, clearDb } from './helpers/db.js';
import { buildApp, signupFamily } from './helpers/factory.js';
import { env } from '../src/config/env.js';
import { User } from '../src/models/User.js';
import { Activity } from '../src/models/Activity.js';
import { Document } from '../src/models/Document.js';
import { VaultItem } from '../src/models/VaultItem.js';
import { Share } from '../src/models/Share.js';
import { RefreshToken } from '../src/models/RefreshToken.js';
import { PlatformSettings } from '../src/models/PlatformSettings.js';

// The super admin in tests is the PLATFORM_OWNER_EMAIL fallback (SUPER_ADMIN_EMAIL unset).
const SUPER = env.EFFECTIVE_SUPER_ADMIN_EMAIL;

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

const bearer = (s) => ({ Authorization: `Bearer ${s.accessToken}` });
const get = (s, path) => request(app).get(`/api/admin${path}`).set(bearer(s));
const post = (s, path, body = {}) => request(app).post(`/api/admin${path}`).set(bearer(s)).send(body);
const patch = (s, path, body) => request(app).patch(`/api/admin${path}`).set(bearer(s)).send(body);
const del = (s, path) => request(app).delete(`/api/admin${path}`).set(bearer(s));

async function superAdmin() {
  return signupFamily(app, { email: SUPER });
}

/** A DB admin, added by the given super admin session. */
async function dbAdmin(sup, overrides = {}) {
  const s = await signupFamily(app, overrides);
  await post(sup, '/admins', { email: s.user.email }).expect(201);
  return s;
}

describe('access control', () => {
  it('401 without a token, 403 NOT_PLATFORM_ADMIN for a normal user on every endpoint', async () => {
    await request(app).get('/api/admin/me').expect(401);
    const u = await signupFamily(app);
    const id = u.user.id;
    const calls = [
      get(u, '/me'),
      get(u, '/overview'),
      get(u, '/users'),
      get(u, `/users/${id}`),
      patch(u, `/users/${id}`, { disabled: true }),
      post(u, `/users/${id}/logout-all`),
      get(u, '/families'),
      get(u, `/families/${u.familyId}`),
      get(u, '/activity'),
      get(u, '/shares'),
      post(u, `/shares/${id}/revoke`),
      get(u, '/system'),
      get(u, '/admins'),
      post(u, '/admins', { email: 'x@example.com' }),
      del(u, `/admins/${id}`),
    ];
    for (const res of await Promise.all(calls)) {
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('NOT_PLATFORM_ADMIN');
    }
  });

  it('super admin and DB admin both get in, with the right role', async () => {
    const sup = await superAdmin();
    const me = await get(sup, '/me').expect(200);
    expect(me.body).toEqual({ email: SUPER, role: 'super', isSuperAdmin: true });

    const adm = await dbAdmin(sup);
    const me2 = await get(adm, '/me').expect(200);
    expect(me2.body).toEqual({ email: adm.user.email, role: 'admin', isSuperAdmin: false });
    await get(adm, '/overview').expect(200);
  });

  it('platform settings: GET reports role; PATCH and bin stay super admin only', async () => {
    const sup = await superAdmin();
    const adm = await dbAdmin(sup);
    const u = await signupFamily(app);

    const g1 = await request(app).get('/api/platform-settings').set(bearer(sup)).expect(200);
    expect(g1.body).toMatchObject({ isPlatformOwner: true, platformRole: 'super', isPlatformAdmin: true });
    const g2 = await request(app).get('/api/platform-settings').set(bearer(adm)).expect(200);
    expect(g2.body).toMatchObject({ isPlatformOwner: false, platformRole: 'admin', isPlatformAdmin: true });
    const g3 = await request(app).get('/api/platform-settings').set(bearer(u)).expect(200);
    expect(g3.body).toMatchObject({ isPlatformOwner: false, platformRole: null, isPlatformAdmin: false });

    const p = await request(app)
      .patch('/api/platform-settings')
      .set(bearer(adm))
      .send({ allowedLoginMethods: 'password' })
      .expect(403);
    expect(p.body.code).toBe('SUPER_ADMIN_ONLY');
    await request(app).get('/api/platform-settings/bin').set(bearer(adm)).expect(403);
    await request(app)
      .patch('/api/platform-settings')
      .set(bearer(sup))
      .send({ allowedLoginMethods: 'password' })
      .expect(200);
  });
});

describe('admins', () => {
  it('add, list and remove admins; super admin email is rejected and not removable', async () => {
    const sup = await superAdmin();
    const other = await signupFamily(app);

    await post(sup, '/admins', { email: 'not-an-email' }).expect(400);
    const dupSuper = await post(sup, '/admins', { email: `  ${SUPER.toUpperCase()} ` }).expect(409);
    expect(dupSuper.body.code).toBe('IS_SUPER_ADMIN');

    const added = await post(sup, '/admins', { email: other.user.email.toUpperCase() }).expect(201);
    expect(added.body).toMatchObject({ email: other.user.email, name: other.user.name, addedBy: { email: SUPER } });
    const dup = await post(sup, '/admins', { email: other.user.email }).expect(409);
    expect(dup.body.code).toBe('ALREADY_ADMIN');

    const list = await get(sup, '/admins').expect(200);
    expect(list.body.superAdmin).toEqual({ email: SUPER, name: sup.user.name });
    expect(list.body.admins.map((a) => a.email)).toEqual([other.user.email]);

    // Any admin can add/remove admins.
    const third = await post(other, '/admins', { email: 'later@example.com' }).expect(201);
    expect(third.body.name).toBeNull();
    await del(other, `/admins/${third.body.id}`).expect(204);
    await del(sup, `/admins/${added.body.id}`).expect(204);
    await del(sup, `/admins/${added.body.id}`).expect(404);

    // Removed admin loses access; super admin is untouched.
    const denied = await get(other, '/me').expect(403);
    expect(denied.body.code).toBe('NOT_PLATFORM_ADMIN');
    await get(sup, '/me').expect(200);

    const actions = (await Activity.find({ action: /^admin\.admin\./ }).lean()).map((a) => a.action).sort();
    expect(actions).toEqual(['admin.admin.add', 'admin.admin.add', 'admin.admin.remove', 'admin.admin.remove']);
  });
});

describe('users', () => {
  it('cannot disable or log out the super admin, cannot disable yourself', async () => {
    const sup = await superAdmin();
    const adm = await dbAdmin(sup);

    const r1 = await patch(adm, `/users/${sup.user.id}`, { disabled: true }).expect(403);
    expect(r1.body.code).toBe('SUPER_ADMIN_PROTECTED');
    const r2 = await post(adm, `/users/${sup.user.id}/logout-all`).expect(403);
    expect(r2.body.code).toBe('SUPER_ADMIN_PROTECTED');
    const r3 = await patch(sup, `/users/${sup.user.id}`, { disabled: true }).expect(403);
    expect(r3.body.code).toBe('SUPER_ADMIN_PROTECTED');
    const r4 = await patch(adm, `/users/${adm.user.id}`, { disabled: true }).expect(403);
    expect(r4.body.code).toBe('CANNOT_MODIFY_SELF');

    expect((await User.findById(sup.user.id).lean()).disabled).toBe(false);
    expect((await User.findById(adm.user.id).lean()).disabled).toBe(false);
    await patch(adm, `/users/${adm.user.id}`, { disabled: 'yes' }).expect(400);
  });

  it('disabling blocks login and the session; enabling restores it; both are logged', async () => {
    const sup = await superAdmin();
    const u = await signupFamily(app);

    const res = await patch(sup, `/users/${u.user.id}`, { disabled: true }).expect(200);
    expect(res.body).toMatchObject({ id: u.user.id, disabled: true, isSuperAdmin: false, isAdmin: false });

    const login = await request(app)
      .post('/api/auth/login')
      .send({ email: u.payload.email, password: u.payload.password });
    expect(login.status).toBe(403);
    expect(login.body.code).toBe('ACCOUNT_DISABLED');
    await request(app).get('/api/auth/me').set(bearer(u)).expect(403);
    const refresh = await request(app).post('/api/auth/refresh').send({ refreshToken: u.refreshToken });
    expect(refresh.status).toBeGreaterThanOrEqual(400);

    // A disabled admin loses admin access too.
    await post(sup, '/admins', { email: u.user.email }).expect(201);
    await get(u, '/me').expect(403);

    await patch(sup, `/users/${u.user.id}`, { disabled: false }).expect(200);
    await request(app)
      .post('/api/auth/login')
      .send({ email: u.payload.email, password: u.payload.password })
      .expect(200);

    const acts = await Activity.find({ action: /^admin\.user\./ }).lean();
    expect(acts.map((a) => a.action).sort()).toEqual(['admin.user.disable', 'admin.user.enable']);
    expect(String(acts[0].meta.actorUserId)).toBe(sup.user.id);
    expect(acts[0].familyId).toBeNull();

    // Admin rows show up in the admin activity feed, with the acting admin resolved.
    const feed = await get(sup, `/activity?action=admin.user.disable`).expect(200);
    expect(feed.body.items).toHaveLength(1);
    expect(feed.body.items[0]).toMatchObject({
      action: 'admin.user.disable',
      actor: { id: sup.user.id, email: SUPER },
      family: null,
      targetType: 'user',
      targetTitle: u.user.email,
    });
  });

  it('logout-all revokes every refresh token', async () => {
    const sup = await superAdmin();
    const u = await signupFamily(app);
    await request(app).post('/api/auth/login').send({ email: u.payload.email, password: u.payload.password }).expect(200);

    const detail = await get(sup, `/users/${u.user.id}`).expect(200);
    expect(detail.body.activeSessions).toBe(2);

    const res = await post(sup, `/users/${u.user.id}/logout-all`).expect(200);
    expect(res.body).toEqual({ revoked: 2 });
    expect(await RefreshToken.countDocuments({ userId: u.user.id, revokedAt: null })).toBe(0);
    const refresh = await request(app).post('/api/auth/refresh').send({ refreshToken: u.refreshToken });
    expect(refresh.status).toBe(401);
    expect(await Activity.countDocuments({ action: 'admin.user.logout_all' })).toBe(1);

    const after = await get(sup, `/users/${u.user.id}`).expect(200);
    expect(after.body.activeSessions).toBe(0);
  });

  it('lists users with search, status filter and pagination', async () => {
    const sup = await superAdmin();
    const a = await signupFamily(app, { name: 'Alice Search' });
    await signupFamily(app);
    await patch(sup, `/users/${a.user.id}`, { disabled: true }).expect(200);

    const p1 = await get(sup, '/users?limit=2&page=1').expect(200);
    expect(p1.body).toMatchObject({ total: 3, page: 1, limit: 2 });
    expect(p1.body.items).toHaveLength(2);
    const p2 = await get(sup, '/users?limit=2&page=2').expect(200);
    expect(p2.body.items).toHaveLength(1);
    const ids = [...p1.body.items, ...p2.body.items].map((x) => x.id);
    expect(new Set(ids).size).toBe(3);

    expect((await get(sup, '/users?limit=500').expect(200)).body.limit).toBe(100);

    const q = await get(sup, '/users?q=alice%20SEARCH').expect(200);
    expect(q.body.items.map((x) => x.id)).toEqual([a.user.id]);
    expect(q.body.items[0].families).toEqual([
      { id: a.familyId, name: a.family.name, role: 'admin', access: 'write' },
    ]);
    // Regex characters are escaped, not interpreted.
    expect((await get(sup, '/users?q=.*').expect(200)).body.total).toBe(0);

    expect((await get(sup, '/users?status=disabled').expect(200)).body.items.map((x) => x.id)).toEqual([a.user.id]);
    expect((await get(sup, '/users?status=active').expect(200)).body.total).toBe(2);
    const supRow = (await get(sup, `/users?q=${encodeURIComponent(SUPER)}`).expect(200)).body.items[0];
    expect(supRow.isSuperAdmin).toBe(true);
  });
});

describe('families, shares, activity', () => {
  it('lists families with counts and pagination; shows family detail', async () => {
    const sup = await superAdmin();
    const f = await signupFamily(app, { familyName: 'Sharma Household' });
    await signupFamily(app);
    await VaultItem.create({
      familyId: f.familyId,
      folderId: new mongoose.Types.ObjectId(),
      kind: 'login',
      title: 'Bank',
      createdBy: f.membership.id,
    });

    const list = await get(sup, '/families?limit=2').expect(200);
    expect(list.body).toMatchObject({ total: 3, page: 1, limit: 2 });
    expect(list.body.items).toHaveLength(2);

    const q = await get(sup, '/families?q=sharma').expect(200);
    expect(q.body.total).toBe(1);
    expect(q.body.items[0]).toMatchObject({
      id: f.familyId,
      name: 'Sharma Household',
      owner: { id: f.user.id, email: f.payload.email },
      members: 1,
      passwords: 1,
      notes: 0,
      documents: 0,
      files: 0,
      storageBytes: 0,
    });
    expect(q.body.items[0].folders).toBeGreaterThanOrEqual(1);

    const detail = await get(sup, `/families/${f.familyId}`).expect(200);
    expect(detail.body.family.id).toBe(f.familyId);
    expect(detail.body.members).toHaveLength(1);
    expect(detail.body.members[0]).toMatchObject({
      userId: f.user.id,
      email: f.payload.email,
      role: 'admin',
      status: 'active',
    });
    expect(Array.isArray(detail.body.recentActivity)).toBe(true);
    await get(sup, `/families/${new mongoose.Types.ObjectId()}`).expect(404);
  });

  it('lists shares by status and revokes one', async () => {
    const sup = await superAdmin();
    const f = await signupFamily(app);
    const doc = await Document.create({
      familyId: f.familyId,
      folderId: new mongoose.Types.ObjectId(),
      title: 'Passport',
      createdBy: f.membership.id,
    });
    const base = { familyId: f.familyId, targetType: 'document', targetId: doc._id, duration: '24h', createdBy: f.membership.id };
    const active = await Share.create({ ...base, tokenHash: 'h1', expiresAt: new Date(Date.now() + 3600e3) });
    await Share.create({ ...base, tokenHash: 'h2', expiresAt: new Date(Date.now() - 3600e3) });
    await Share.create({ ...base, tokenHash: 'h3', expiresAt: new Date(Date.now() + 3600e3), revokedAt: new Date() });

    expect((await get(sup, '/shares').expect(200)).body.total).toBe(3);
    const act = await get(sup, '/shares?status=active').expect(200);
    expect(act.body.total).toBe(1);
    expect(act.body.items[0]).toMatchObject({
      id: String(active._id),
      family: { id: f.familyId },
      targetType: 'document',
      targetTitle: 'Passport',
      createdBy: { name: f.membership.name, email: f.payload.email },
      opens: 0,
      hasPassword: false,
      status: 'active',
    });
    expect((await get(sup, '/shares?status=expired').expect(200)).body.items[0].status).toBe('expired');
    expect((await get(sup, '/shares?status=revoked').expect(200)).body.total).toBe(1);
    expect((await get(sup, `/shares?familyId=${new mongoose.Types.ObjectId()}`).expect(200)).body.total).toBe(0);
    expect((await get(sup, '/shares?limit=2&page=2').expect(200)).body.items).toHaveLength(1);

    const rev = await post(sup, `/shares/${active._id}/revoke`).expect(200);
    expect(rev.body.status).toBe('revoked');
    expect(rev.body.revokedAt).toBeTruthy();
    expect((await Share.findById(active._id).lean()).revokedAt).toBeTruthy();
    const logged = await Activity.findOne({ action: 'admin.share.revoke' }).lean();
    expect(String(logged.familyId)).toBe(f.familyId);
    await post(sup, `/shares/${new mongoose.Types.ObjectId()}/revoke`).expect(404);
  });

  it('paginates the activity feed with a cursor and filters by family', async () => {
    const sup = await superAdmin();
    const f = await signupFamily(app);
    const expiresAt = new Date(Date.now() + 86400e3);
    for (let i = 0; i < 5; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      await Activity.create({ familyId: f.familyId, action: 'document.create', meta: { title: `Doc ${i}` }, expiresAt });
    }

    const p1 = await get(sup, `/activity?familyId=${f.familyId}&action=document.create&limit=3`).expect(200);
    expect(p1.body.items).toHaveLength(3);
    expect(p1.body.nextCursor).toBeTruthy();
    expect(p1.body.items[0]).toMatchObject({ action: 'document.create', family: { id: f.familyId, name: f.family.name } });
    expect(p1.body.items[0].targetTitle).toMatch(/^Doc \d$/);

    const p2 = await get(
      sup,
      `/activity?familyId=${f.familyId}&action=document.create&limit=3&cursor=${p1.body.nextCursor}`,
    ).expect(200);
    expect(p2.body.items).toHaveLength(2);
    expect(p2.body.nextCursor).toBeNull();
    const titles = [...p1.body.items, ...p2.body.items].map((x) => x.targetTitle);
    expect(new Set(titles).size).toBe(5);

    await get(sup, '/activity?cursor=garbage').expect(400);
    await get(sup, '/activity?from=not-a-date').expect(400);

    const overview = await get(sup, '/overview').expect(200);
    expect(overview.body.counts).toMatchObject({ users: 2, families: 2, members: 2 });
    expect(overview.body.recentActivity.length).toBeLessThanOrEqual(10);
    expect(overview.body.signups).toEqual({ last7d: 2, last30d: 2 });

    const sys = await get(sup, '/system').expect(200);
    expect(sys.body.app.nodeVersion).toBe(process.version);
    expect(sys.body.db.collections.users).toBe(2);
    expect(typeof sys.body.memory.rssBytes).toBe('number');
  });
});

describe('privacy', () => {
  const FORBIDDEN_KEYS = new Set([
    'passwordHash',
    'tokenHash',
    'storageKey',
    'thumbKey',
    'encryption',
    'thumbEncryption',
    'wrappedKey',
    'passEncrypted',
    'pass',
    'refreshToken',
    'accessToken',
    'token',
    'url',
    'thumbUrl',
    'downloadUrl',
    'username',
    'password',
    'fields',
    'value',
    'meta',
    'ipHash',
    'userAgent',
  ]);

  function collectKeys(value, out = []) {
    if (Array.isArray(value)) value.forEach((v) => collectKeys(v, out));
    else if (value && typeof value === 'object') {
      for (const [k, v] of Object.entries(value)) {
        out.push(k);
        collectKeys(v, out);
      }
    }
    return out;
  }

  it('no admin endpoint ever returns secrets, file keys, tokens or hashes', async () => {
    const sup = await superAdmin();
    const f = await signupFamily(app);
    const folderId = new mongoose.Types.ObjectId();
    const doc = await Document.create({
      familyId: f.familyId,
      folderId,
      title: 'Passport',
      notes: 'SECRET_DOC_NOTE',
      files: [
        {
          storageKey: 'SECRET_STORAGE_KEY',
          thumbKey: 'SECRET_THUMB_KEY',
          originalName: 'passport.png',
          mimeType: 'image/png',
          size: 1234,
          encryption: { iv: 'SECRET_IV', tag: 'SECRET_TAG', wrappedKey: 'SECRET_WRAPPED', keyIv: 'a', keyTag: 'b' },
          uploadedBy: f.membership.id,
        },
      ],
      createdBy: f.membership.id,
    });
    await VaultItem.create({
      familyId: f.familyId,
      folderId,
      kind: 'login',
      title: 'Bank',
      username: 'SECRET_USERNAME',
      password: 'SECRET_PASSWORD',
      fields: [{ key: 'PIN', value: 'SECRET_FIELD_VALUE' }],
      notes: 'SECRET_ITEM_NOTE',
      createdBy: f.membership.id,
    });
    await VaultItem.create({ familyId: f.familyId, folderId, kind: 'note', title: 'Diary', notes: 'SECRET_NOTE_BODY', createdBy: f.membership.id });
    const share = await Share.create({
      familyId: f.familyId,
      tokenHash: 'SECRET_SHARE_TOKEN_HASH',
      targetType: 'document',
      targetId: doc._id,
      duration: '24h',
      expiresAt: new Date(Date.now() + 3600e3),
      createdBy: f.membership.id,
    });
    await Activity.create({
      familyId: f.familyId,
      actorMembershipId: f.membership.id,
      actorName: f.membership.name,
      action: 'document.update',
      targetType: 'document',
      targetId: doc._id,
      meta: { title: 'Passport', leaked: 'SECRET_META_VALUE' },
      ipHash: 'SECRET_IP_HASH',
      expiresAt: new Date(Date.now() + 86400e3),
    });
    await PlatformSettings.findByIdAndUpdate(
      'platform',
      { 'smtp.host': 'smtp.example.com', 'smtp.passEncrypted': 'SECRET_SMTP_CIPHER' },
      { upsert: true },
    );

    const users = await User.find({}).select('passwordHash').lean();
    const tokens = await RefreshToken.find({}).select('tokenHash').lean();
    const secrets = [
      'SECRET_',
      f.refreshToken,
      f.accessToken,
      sup.refreshToken,
      ...users.map((u) => u.passwordHash).filter(Boolean),
      ...tokens.map((t) => t.tokenHash),
    ];

    const responses = [
      await get(sup, '/me'),
      await get(sup, '/overview'),
      await get(sup, '/users'),
      await get(sup, `/users/${f.user.id}`),
      await get(sup, '/families'),
      await get(sup, `/families/${f.familyId}`),
      await get(sup, '/activity'),
      await get(sup, '/shares'),
      await get(sup, '/system'),
      await post(sup, '/admins', { email: 'new-admin@example.com' }),
      await get(sup, '/admins'),
      await patch(sup, `/users/${f.user.id}`, { disabled: true }),
      await patch(sup, `/users/${f.user.id}`, { disabled: false }),
      await post(sup, `/users/${f.user.id}/logout-all`),
      await post(sup, `/shares/${share._id}/revoke`),
      await get(sup, '/activity'),
    ];

    for (const res of responses) {
      expect(res.status, res.req.path).toBeLessThan(300);
      const text = JSON.stringify(res.body);
      for (const s of secrets) expect(text.includes(s), `${res.req.path} leaked ${s}`).toBe(false);
      const leakedKeys = collectKeys(res.body).filter((k) => FORBIDDEN_KEYS.has(k));
      expect(leakedKeys, res.req.path).toEqual([]);
    }

    // Sanity: the data really was there to leak (titles/counts come through).
    const shares = responses[7].body.items;
    expect(shares[0].targetTitle).toBe('Passport');
    const fam = responses[5].body.family;
    expect(fam).toMatchObject({ documents: 1, files: 1, passwords: 1, notes: 1 });
  });
});
