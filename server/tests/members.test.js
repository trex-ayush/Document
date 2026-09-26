import './helpers/setupEnv.js';
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { startTestDb, stopTestDb, clearDb } from './helpers/db.js';
import { buildApp, signupFamily, authed } from './helpers/factory.js';
import { Membership } from '../src/models/Membership.js';

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

describe('GET /members', () => {
  it('lists the owner membership with user.email', async () => {
    const s = await signupFamily(app);
    const res = await authed(request(app).get('/api/members'), s);
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].isOwner).toBe(true);
    expect(res.body.items[0].user.email).toBe(s.user.email);
  });

  it('400 MISSING_FAMILY_ID with no X-Family-Id header', async () => {
    const s = await signupFamily(app);
    const res = await request(app).get('/api/members').set('Authorization', `Bearer ${s.accessToken}`);
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('MISSING_FAMILY_ID');
  });

  it('403 NOT_A_MEMBER for a family the caller does not belong to', async () => {
    const s1 = await signupFamily(app);
    const s2 = await signupFamily(app);
    const res = await request(app)
      .get('/api/members')
      .set('Authorization', `Bearer ${s1.accessToken}`)
      .set('X-Family-Id', s2.family.id);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('NOT_A_MEMBER');
  });
});

describe('POST /members', () => {
  it('admin can create a login-enabled member (temp password)', async () => {
    const s = await signupFamily(app);
    const res = await authed(request(app).post('/api/members'), s).send({
      name: 'Kid One',
      email: 'kid1@example.com',
      tempPassword: 'tempPass123',
      access: 'read',
    });

    expect(res.status).toBe(201);
    expect(res.body.canLogin).toBe(true);
    expect(res.body.user.email).toBe('kid1@example.com');
    expect(res.body.role).toBe('member');
    expect(res.body.isOwner).toBe(false);
    expect(res.body.invitedEmail).toBeUndefined();

    // the created member can log in
    const login = await request(app).post('/api/auth/login').send({ email: 'kid1@example.com', password: 'tempPass123' });
    expect(login.status).toBe(200);
    expect(login.body.memberships).toHaveLength(1);
  });

  it('admin can create a profile-only (canLogin:false) member', async () => {
    const s = await signupFamily(app);
    const res = await authed(request(app).post('/api/members'), s).send({
      name: 'Grandma',
      canLogin: false,
    });

    expect(res.status).toBe(201);
    expect(res.body.canLogin).toBe(false);
    expect(res.body.user).toBeUndefined();
  });

  it('admin can add a member with only a name and email — invited, write access by default, invite link returned', async () => {
    const s = await signupFamily(app);
    const res = await authed(request(app).post('/api/members'), s).send({ name: 'Dadi', email: 'dadi@example.com' });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ name: 'Dadi', status: 'invited', role: 'member', access: 'write', canLogin: true });
    expect(res.body.user.email).toBe('dadi@example.com');
    expect(res.body.invite.url).toContain('/accept-invite?token=');
    // SMTP is unset in this suite — the response must say the email did not go out.
    expect(res.body.invite.emailSent).toBe(false);

    // Access stays editable later through the normal edit flow.
    const patch = await authed(request(app).patch(`/api/members/${res.body.id}`), s).send({ access: 'read' });
    expect(patch.status).toBe(200);
    expect(patch.body).toMatchObject({ access: 'read', status: 'invited' });
  });

  it('rejects creation without an email (unless canLogin:false) with 400', async () => {
    const s = await signupFamily(app);
    const res = await authed(request(app).post('/api/members'), s).send({ name: 'Incomplete' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  it('rejects unknown fields with 400', async () => {
    const s = await signupFamily(app);
    const res = await authed(request(app).post('/api/members'), s).send({ name: 'X', email: 'x-unknown@example.com', loginMethod: 'google' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  it('rejects duplicate email with 409 EMAIL_TAKEN on the temp-password (non-invite) path', async () => {
    const s = await signupFamily(app);
    await authed(request(app).post('/api/members'), s)
      .send({ name: 'A', email: 'dup@example.com', tempPassword: 'password123', access: 'read' })
      .expect(201);

    const res = await authed(request(app).post('/api/members'), s).send({
      name: 'B',
      email: 'dup@example.com',
      tempPassword: 'password123',
      access: 'read',
    });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('EMAIL_TAKEN');
  });

  it('a non-admin member cannot create members (403)', async () => {
    const s = await signupFamily(app);
    await authed(request(app).post('/api/members'), s)
      .send({ name: 'Member', email: 'member1@example.com', tempPassword: 'password123', access: 'write' })
      .expect(201);

    const memberLogin = await request(app).post('/api/auth/login').send({ email: 'member1@example.com', password: 'password123' });

    const res = await request(app)
      .post('/api/members')
      .set('Authorization', `Bearer ${memberLogin.body.accessToken}`)
      .set('X-Family-Id', s.family.id)
      .send({ name: 'Another', email: 'x@example.com', tempPassword: 'password123', access: 'read' });
    expect(res.status).toBe(403);
  });

  describe('multi-family invite decoupling (sendInvite:true)', () => {
    it('email with NO existing account: Membership created with userId:null, no User row pre-created', async () => {
      const s = await signupFamily(app);
      const res = await authed(request(app).post('/api/members'), s).send({
        name: 'Brand New Invitee',
        email: 'brand-new-invitee@example.com',
        access: 'read',
        sendInvite: true,
      });
      expect(res.status).toBe(201);
      expect(res.body.status).toBe('invited');
      expect(res.body.user.email).toBe('brand-new-invitee@example.com');

      const membership = await Membership.findById(res.body.id);
      expect(membership.userId).toBeNull();
      expect(membership.invitedEmail).toBe('brand-new-invitee@example.com');

      // Not usable to log in yet.
      const loginAttempt = await request(app)
        .post('/api/auth/login')
        .send({ email: 'brand-new-invitee@example.com', password: 'anything' });
      expect(loginAttempt.status).toBe(401);
    });

    it('email that ALREADY has a User account: Membership links straight to that userId, still status invited', async () => {
      const familyA = await signupFamily(app);
      const familyB = await signupFamily(app);
      // The invitee already has an independent account (already a member of family B).
      const existingEmail = familyB.payload.email;

      const res = await authed(request(app).post('/api/members'), familyA).send({
        name: 'Already Has Account',
        email: existingEmail,
        access: 'read',
        sendInvite: true,
      });
      expect(res.status).toBe(201);
      expect(res.body.status).toBe('invited');

      const membership = await Membership.findById(res.body.id);
      expect(String(membership.userId)).toBe(familyB.user.id);
      expect(membership.invitedEmail).toBeNull();

      // Logging in with that email (any method) activates BOTH memberships now.
      const login = await request(app).post('/api/auth/login').send({ email: existingEmail, password: familyB.payload.password });
      expect(login.status).toBe(200);
      const familyIds = login.body.memberships.map((m) => m.familyId).sort();
      expect(familyIds).toEqual([familyA.family.id, familyB.family.id].sort());
    });
  });
});

describe('PATCH /members/:id', () => {
  it('disabling a member immediately revokes their refresh tokens', async () => {
    const s = await signupFamily(app);
    const create = await authed(request(app).post('/api/members'), s).send({
      name: 'Kid',
      email: 'kid2@example.com',
      tempPassword: 'password123',
      access: 'read',
    });

    const login = await request(app).post('/api/auth/login').send({ email: 'kid2@example.com', password: 'password123' });
    expect(login.status).toBe(200);

    await authed(request(app).patch(`/api/members/${create.body.id}`), s).send({ status: 'disabled' }).expect(200);

    const refreshRes = await request(app).post('/api/auth/refresh').send({ refreshToken: login.body.refreshToken });
    expect(refreshRes.status).toBe(401);

    // Multi-family: disabling ONE membership is per-family, not an account-level kill switch — the
    // user can still log in (they might belong to other families), they just no longer have an
    // active membership in THIS one.
    const loginAgain = await request(app).post('/api/auth/login').send({ email: 'kid2@example.com', password: 'password123' });
    expect(loginAgain.status).toBe(200);
    expect(loginAgain.body.memberships).toEqual([]);
  });

  it('cannot disable the owner membership (400 CANNOT_REMOVE_OWNER)', async () => {
    const s = await signupFamily(app);
    const res = await authed(request(app).patch(`/api/members/${s.membership.id}`), s).send({ status: 'disabled' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('CANNOT_REMOVE_OWNER');
  });
});

describe('POST /members/:id/reset-password', () => {
  it('resets the password and revokes existing refresh tokens', async () => {
    const s = await signupFamily(app);
    const create = await authed(request(app).post('/api/members'), s).send({
      name: 'Kid',
      email: 'kid3@example.com',
      tempPassword: 'password123',
      access: 'read',
    });
    const login = await request(app).post('/api/auth/login').send({ email: 'kid3@example.com', password: 'password123' });

    await authed(request(app).post(`/api/members/${create.body.id}/reset-password`), s)
      .send({ newPassword: 'brandnewpass1' })
      .expect(204);

    const refreshRes = await request(app).post('/api/auth/refresh').send({ refreshToken: login.body.refreshToken });
    expect(refreshRes.status).toBe(401);

    const newLogin = await request(app).post('/api/auth/login').send({ email: 'kid3@example.com', password: 'brandnewpass1' });
    expect(newLogin.status).toBe(200);
  });
});

describe('DELETE /members/:id', () => {
  it('removes a non-owner member', async () => {
    const s = await signupFamily(app);
    const create = await authed(request(app).post('/api/members'), s).send({
      name: 'Kid',
      email: 'kid4@example.com',
      tempPassword: 'password123',
      access: 'read',
    });

    await authed(request(app).delete(`/api/members/${create.body.id}`), s).expect(204);

    const listRes = await authed(request(app).get('/api/members'), s);
    expect(listRes.body.items.find((m) => m.id === create.body.id)).toBeUndefined();
  });

  it('removing a member removes only their access — everything they added stays', async () => {
    const s = await signupFamily(app);
    await authed(request(app).post('/api/members'), s).send({
      name: 'Rahul',
      email: 'rahul-keep@example.com',
      tempPassword: 'password123',
    });
    const login = await request(app).post('/api/auth/login').send({ email: 'rahul-keep@example.com', password: 'password123' });
    const rahul = { accessToken: login.body.accessToken, familyId: s.familyId };
    const rahulMembership = (await authed(request(app).get('/api/members'), s)).body.items.find((m) => m.name === 'Rahul');
    expect(rahulMembership.access).toBe('write');

    const folder = await authed(request(app).post('/api/folders'), rahul).send({ name: 'Rahul' });
    expect(folder.status).toBe(201);
    const note = await authed(request(app).post('/api/items'), rahul).send({ kind: 'note', title: 'Exam roll no', folderId: folder.body.id, notes: '12345' });
    const pwd = await authed(request(app).post('/api/items'), rahul).send({ kind: 'login', title: 'School portal', password: 'pw-1' });
    expect(note.status).toBe(201);
    expect(pwd.status).toBe(201);

    await authed(request(app).delete(`/api/members/${rahulMembership.id}`), s).expect(204);

    // Rahul can no longer get in…
    const after = await authed(request(app).get('/api/items'), rahul);
    // No access either way: 401 when his session was already signed out by the removal (immediate
    // sign-out), 403 when the token is from the same second and only the membership check refuses.
    expect([401, 403]).toContain(after.status);

    // …but the family still has everything he added.
    const noteRes = await authed(request(app).get(`/api/items/${note.body.id}`), s);
    expect(noteRes.status).toBe(200);
    expect(noteRes.body.notes).toBe('12345');
    const pwdRes = await authed(request(app).get(`/api/items/${pwd.body.id}`), s);
    expect(pwdRes.body.password).toBe('pw-1');
    const browse = await authed(request(app).get('/api/folders/browse'), s);
    expect(browse.body.folders.map((f) => f.name)).toContain('Rahul');
    const stats = await authed(request(app).get('/api/stats'), s);
    expect(stats.body.counts).toMatchObject({ passwords: 1, notes: 1, members: 1 });
  });

  it('cannot remove the owner membership (400 CANNOT_REMOVE_OWNER)', async () => {
    const s = await signupFamily(app);
    const res = await authed(request(app).delete(`/api/members/${s.membership.id}`), s);
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('CANNOT_REMOVE_OWNER');
  });
});

describe('PATCH /members/:id role (family admins)', () => {
  /** A regular member of `s`'s family via the legacy temp-password shape, plus their session. */
  async function memberSession(s, email, access = 'write') {
    const created = await authed(request(app).post('/api/members'), s)
      .send({ name: 'Helper', email, tempPassword: 'password123', access })
      .expect(201);
    const login = await request(app).post('/api/auth/login').send({ email, password: 'password123' });
    expect(login.status).toBe(200);
    return { id: created.body.id, accessToken: login.body.accessToken, familyId: s.familyId };
  }

  it('promotes a member to admin, who can then invite people and change family settings; demoting takes it away again', async () => {
    const s = await signupFamily(app);
    const m = await memberSession(s, 'helper1@example.com', 'read');

    // Before: a plain member is refused.
    await authed(request(app).post('/api/members'), m).send({ name: 'Cousin', email: 'cousin1@example.com' }).expect(403);
    await authed(request(app).patch('/api/family'), m).send({ name: 'Renamed' }).expect(403);
    await authed(request(app).get('/api/me/notification-prefs'), m).expect(403);

    const promote = await authed(request(app).patch(`/api/members/${m.id}`), s).send({ role: 'admin' });
    expect(promote.status).toBe(200);
    expect(promote.body.role).toBe('admin');
    // Making someone admin forces write access.
    expect(promote.body.access).toBe('write');

    // The change is logged as a member update naming the new role.
    const { Activity } = await import('../src/models/Activity.js');
    const log = await Activity.findOne({ action: 'member.update', targetId: m.id }).lean();
    expect(log.meta.changedKeys).toEqual(expect.arrayContaining(['role', 'access']));
    expect(log.meta.role).toBe('admin');

    // After: the same (still valid) session can invite and open family settings.
    const invite = await authed(request(app).post('/api/members'), m).send({ name: 'Cousin', email: 'cousin1@example.com' });
    expect(invite.status).toBe(201);
    expect(invite.body.status).toBe('invited');
    await authed(request(app).patch('/api/family'), m).send({ name: 'Renamed' }).expect(200);
    await authed(request(app).get('/api/me/notification-prefs'), m).expect(200);

    // Demote back: 403 again (access stays write).
    const demote = await authed(request(app).patch(`/api/members/${m.id}`), s).send({ role: 'member' });
    expect(demote.status).toBe(200);
    expect(demote.body).toMatchObject({ role: 'member', access: 'write' });
    await authed(request(app).post('/api/members'), m).send({ name: 'Other', email: 'other1@example.com' }).expect(403);
    await authed(request(app).patch('/api/family'), m).send({ name: 'Again' }).expect(403);
  });

  it("the owner's role can't be changed (400 CANNOT_CHANGE_OWNER), even by another admin", async () => {
    const s = await signupFamily(app);
    const res = await authed(request(app).patch(`/api/members/${s.membership.id}`), s).send({ role: 'member' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('CANNOT_CHANGE_OWNER');

    const m = await memberSession(s, 'helper2@example.com');
    await authed(request(app).patch(`/api/members/${m.id}`), s).send({ role: 'admin' }).expect(200);
    const byAdmin = await authed(request(app).patch(`/api/members/${s.membership.id}`), m).send({ role: 'member' });
    expect(byAdmin.status).toBe(400);
    expect(byAdmin.body.code).toBe('CANNOT_CHANGE_OWNER');

    const owner = await Membership.findById(s.membership.id).lean();
    expect(owner.role).toBe('admin');
  });

  it('a non-admin cannot change roles (403), not even their own', async () => {
    const s = await signupFamily(app);
    const m = await memberSession(s, 'helper3@example.com');
    const other = await memberSession(s, 'helper4@example.com');

    const self = await authed(request(app).patch(`/api/members/${m.id}`), m).send({ role: 'admin' });
    expect(self.status).toBe(403);
    const res = await authed(request(app).patch(`/api/members/${other.id}`), m).send({ role: 'admin' });
    expect(res.status).toBe(403);

    const after = await Membership.find({ _id: { $in: [m.id, other.id] } }).lean();
    expect(after.map((x) => x.role)).toEqual(['member', 'member']);
  });

  it('an admin can demote themselves while another admin remains, but never the last admin (400 LAST_ADMIN)', async () => {
    const s = await signupFamily(app);
    const m = await memberSession(s, 'helper5@example.com');
    await authed(request(app).patch(`/api/members/${m.id}`), s).send({ role: 'admin' }).expect(200);
    await authed(request(app).patch(`/api/members/${m.id}`), m).send({ role: 'member' }).expect(200);

    // Legacy data with a non-owner as the only admin: they can't demote themselves.
    await authed(request(app).patch(`/api/members/${m.id}`), s).send({ role: 'admin' }).expect(200);
    await Membership.updateOne({ _id: s.membership.id }, { $set: { role: 'member', isOwner: false } });
    const res = await authed(request(app).patch(`/api/members/${m.id}`), m).send({ role: 'member' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('LAST_ADMIN');
  });

  it("a profile-only member can't be made admin (400)", async () => {
    const s = await signupFamily(app);
    const grandma = await authed(request(app).post('/api/members'), s).send({ name: 'Grandma', canLogin: false }).expect(201);
    const res = await authed(request(app).patch(`/api/members/${grandma.body.id}`), s).send({ role: 'admin' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('NOT_LOGIN_ENABLED');
  });

  it("rejects an unknown role value with 400", async () => {
    const s = await signupFamily(app);
    const m = await memberSession(s, 'helper6@example.com');
    const res = await authed(request(app).patch(`/api/members/${m.id}`), s).send({ role: 'owner' });
    expect(res.status).toBe(400);
  });
});
