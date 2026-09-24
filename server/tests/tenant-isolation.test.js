import './helpers/setupEnv.js';
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { startTestDb, stopTestDb, clearDb } from './helpers/db.js';
import { buildApp, signupFamily, authed } from './helpers/factory.js';

// Per docs/DECISIONS.md's "Multi-tenancy" section: spin up two families and assert family A's
// token/header combo can never see/touch family B's rows, across every route this agent owns.
// Multi-family (docs/DECISIONS.md "Multi-family accounts") adds a second dimension on top of the
// original per-family scoping: the access token no longer names a family at all, so isolation now
// also has to hold at the `X-Family-Id` header layer itself (a valid token + someone else's family
// id must never resolve to a working session in that family). Full cross-module isolation
// (documents/folders/shares) is owned by the other module agents' own test suites.
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

describe('multi-family session isolation (X-Family-Id header)', () => {
  it('403 NOT_A_MEMBER when presenting a valid token with a family id the caller does not belong to', async () => {
    const familyA = await signupFamily(app);
    const familyB = await signupFamily(app);

    const res = await request(app)
      .get('/api/members')
      .set('Authorization', `Bearer ${familyA.accessToken}`)
      .set('X-Family-Id', familyB.family.id);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('NOT_A_MEMBER');
  });

  it('400 MISSING_FAMILY_ID when a family-scoped route gets no header at all', async () => {
    const familyA = await signupFamily(app);
    const res = await request(app).get('/api/members').set('Authorization', `Bearer ${familyA.accessToken}`);
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('MISSING_FAMILY_ID');
  });

  it('a user belonging to 2 families sees only the one named by the header, per request', async () => {
    const s = await signupFamily(app);
    const secondFamilyRes = await request(app)
      .post('/api/family')
      .set('Authorization', `Bearer ${s.accessToken}`)
      .send({ familyName: 'Second Family For Isolation' });
    expect(secondFamilyRes.status).toBe(201);
    const secondFamilyId = secondFamilyRes.body.family.id;

    // Add a distinguishing member to EACH family so the two GET /members calls are provably scoped.
    await request(app)
      .post('/api/members')
      .set('Authorization', `Bearer ${s.accessToken}`)
      .set('X-Family-Id', s.family.id)
      .send({ name: 'Only In First', canLogin: false })
      .expect(201);
    await request(app)
      .post('/api/members')
      .set('Authorization', `Bearer ${s.accessToken}`)
      .set('X-Family-Id', secondFamilyId)
      .send({ name: 'Only In Second', canLogin: false })
      .expect(201);

    const firstList = await request(app)
      .get('/api/members')
      .set('Authorization', `Bearer ${s.accessToken}`)
      .set('X-Family-Id', s.family.id);
    const firstNames = firstList.body.items.map((m) => m.name);
    expect(firstNames).toContain('Only In First');
    expect(firstNames).not.toContain('Only In Second');

    const secondList = await request(app)
      .get('/api/members')
      .set('Authorization', `Bearer ${s.accessToken}`)
      .set('X-Family-Id', secondFamilyId);
    const secondNames = secondList.body.items.map((m) => m.name);
    expect(secondNames).toContain('Only In Second');
    expect(secondNames).not.toContain('Only In First');
  });
});

describe('tenant isolation (auth/members/family/document-types)', () => {
  it("family A's token cannot see or touch family B's data", async () => {
    const familyA = await signupFamily(app);
    const familyB = await signupFamily(app);

    // Create an extra member + a custom document type in family B to have foreign ids to probe.
    const bMember = await authed(request(app).post('/api/members'), familyB).send({
      name: 'B Kid',
      email: 'bkid@example.com',
      tempPassword: 'password123',
      access: 'read',
    });
    expect(bMember.status).toBe(201);

    const bDocType = await authed(request(app).post('/api/document-types'), familyB).send({ name: 'B Only Type' });
    expect(bDocType.status).toBe(201);

    // --- GET /family always returns the caller's OWN family, never the other's ---
    const aFamilyRes = await authed(request(app).get('/api/family'), familyA);
    expect(aFamilyRes.status).toBe(200);
    expect(aFamilyRes.body.id).toBe(familyA.family.id);
    expect(aFamilyRes.body.id).not.toBe(familyB.family.id);

    // --- GET /members never includes family B's rows ---
    const aMembersRes = await authed(request(app).get('/api/members'), familyA);
    expect(aMembersRes.status).toBe(200);
    const aMemberIds = aMembersRes.body.items.map((m) => m.id);
    expect(aMemberIds).not.toContain(bMember.body.id);
    expect(aMemberIds).toEqual([familyA.membership.id]);

    // --- PATCH /members/:id on family B's member id -> 404, not leaked/modified ---
    const patchForeign = await authed(request(app).patch(`/api/members/${bMember.body.id}`), familyA).send({ status: 'disabled' });
    expect(patchForeign.status).toBe(404);

    // --- DELETE /members/:id on family B's member id -> 404 ---
    const deleteForeign = await authed(request(app).delete(`/api/members/${bMember.body.id}`), familyA);
    expect(deleteForeign.status).toBe(404);

    // --- POST /members/:id/reset-password on family B's member id -> 404 ---
    const resetForeign = await authed(request(app).post(`/api/members/${bMember.body.id}/reset-password`), familyA).send({
      newPassword: 'irrelevant123',
    });
    expect(resetForeign.status).toBe(404);

    // Confirm family B's member survived all of the above untouched.
    const bMembersRes = await authed(request(app).get('/api/members'), familyB);
    expect(bMembersRes.body.items.map((m) => m.id)).toContain(bMember.body.id);
    expect(bMembersRes.body.items.find((m) => m.id === bMember.body.id).status).toBe('active');

    // --- GET /document-types never includes family B's custom type ---
    const aTypesRes = await authed(request(app).get('/api/document-types'), familyA);
    expect(aTypesRes.body.items.map((t) => t.id)).not.toContain(bDocType.body.id);
    // family A still only has its own 11 seeded defaults
    expect(aTypesRes.body.items).toHaveLength(11);

    // --- PATCH/DELETE /document-types/:id on family B's id -> 404 ---
    const patchForeignType = await authed(request(app).patch(`/api/document-types/${bDocType.body.id}`), familyA).send({
      name: 'Hijacked',
    });
    expect(patchForeignType.status).toBe(404);

    const deleteForeignType = await authed(request(app).delete(`/api/document-types/${bDocType.body.id}`), familyA);
    expect(deleteForeignType.status).toBe(404);

    // Family B's custom type is untouched.
    const bTypesRes = await authed(request(app).get('/api/document-types'), familyB);
    expect(bTypesRes.body.items.find((t) => t.id === bDocType.body.id)?.name).toBe('B Only Type');

    // --- A refresh token minted for family A can never be redeemed to act as family B ---
    // (rotation is purely user-scoped now — no familyId baked into any token at all, multi-family
    // — so this is really just re-confirming the refresh itself still works normally.)
    const refreshA = await request(app).post('/api/auth/refresh').send({ refreshToken: familyA.refreshToken });
    expect(refreshA.status).toBe(200);
  });
});
