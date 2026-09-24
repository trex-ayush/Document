import './helpers/setupEnv.js';
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { startTestDb, stopTestDb, clearDb } from './helpers/db.js';
import { buildApp, signupFamily } from './helpers/factory.js';

// Per docs/DECISIONS.md's "Multi-tenancy" section: spin up two families and assert family A's
// access token can never see/touch family B's rows, across every route this agent owns. Full
// cross-module isolation (documents/folders/shares) is Agents B/C's own test responsibility once
// those modules exist, plus a later Phase-3 integration pass across all modules together.
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

describe('tenant isolation (auth/members/family/document-types)', () => {
  it("family A's token cannot see or touch family B's data", async () => {
    const familyA = await signupFamily(app);
    const familyB = await signupFamily(app);

    // Create an extra member + a custom document type in family B to have foreign ids to probe.
    const bMember = await request(app)
      .post('/api/members')
      .set('Authorization', `Bearer ${familyB.accessToken}`)
      .send({ name: 'B Kid', email: 'bkid@example.com', tempPassword: 'password123', access: 'read' });
    expect(bMember.status).toBe(201);

    const bDocType = await request(app)
      .post('/api/document-types')
      .set('Authorization', `Bearer ${familyB.accessToken}`)
      .send({ name: 'B Only Type' });
    expect(bDocType.status).toBe(201);

    // --- GET /family always returns the caller's OWN family, never the other's ---
    const aFamilyRes = await request(app).get('/api/family').set('Authorization', `Bearer ${familyA.accessToken}`);
    expect(aFamilyRes.status).toBe(200);
    expect(aFamilyRes.body.id).toBe(familyA.family.id);
    expect(aFamilyRes.body.id).not.toBe(familyB.family.id);

    // --- GET /members never includes family B's rows ---
    const aMembersRes = await request(app).get('/api/members').set('Authorization', `Bearer ${familyA.accessToken}`);
    expect(aMembersRes.status).toBe(200);
    const aMemberIds = aMembersRes.body.items.map((m) => m.id);
    expect(aMemberIds).not.toContain(bMember.body.id);
    expect(aMemberIds).toEqual([familyA.membership.id]);

    // --- PATCH /members/:id on family B's member id -> 404, not leaked/modified ---
    const patchForeign = await request(app)
      .patch(`/api/members/${bMember.body.id}`)
      .set('Authorization', `Bearer ${familyA.accessToken}`)
      .send({ status: 'disabled' });
    expect(patchForeign.status).toBe(404);

    // --- DELETE /members/:id on family B's member id -> 404 ---
    const deleteForeign = await request(app)
      .delete(`/api/members/${bMember.body.id}`)
      .set('Authorization', `Bearer ${familyA.accessToken}`);
    expect(deleteForeign.status).toBe(404);

    // --- POST /members/:id/reset-password on family B's member id -> 404 ---
    const resetForeign = await request(app)
      .post(`/api/members/${bMember.body.id}/reset-password`)
      .set('Authorization', `Bearer ${familyA.accessToken}`)
      .send({ newPassword: 'irrelevant123' });
    expect(resetForeign.status).toBe(404);

    // Confirm family B's member survived all of the above untouched.
    const bMembersRes = await request(app).get('/api/members').set('Authorization', `Bearer ${familyB.accessToken}`);
    expect(bMembersRes.body.items.map((m) => m.id)).toContain(bMember.body.id);
    expect(bMembersRes.body.items.find((m) => m.id === bMember.body.id).status).toBe('active');

    // --- GET /document-types never includes family B's custom type ---
    const aTypesRes = await request(app)
      .get('/api/document-types')
      .set('Authorization', `Bearer ${familyA.accessToken}`);
    expect(aTypesRes.body.items.map((t) => t.id)).not.toContain(bDocType.body.id);
    // family A still only has its own 11 seeded defaults
    expect(aTypesRes.body.items).toHaveLength(11);

    // --- PATCH/DELETE /document-types/:id on family B's id -> 404 ---
    const patchForeignType = await request(app)
      .patch(`/api/document-types/${bDocType.body.id}`)
      .set('Authorization', `Bearer ${familyA.accessToken}`)
      .send({ name: 'Hijacked' });
    expect(patchForeignType.status).toBe(404);

    const deleteForeignType = await request(app)
      .delete(`/api/document-types/${bDocType.body.id}`)
      .set('Authorization', `Bearer ${familyA.accessToken}`);
    expect(deleteForeignType.status).toBe(404);

    // Family B's custom type is untouched.
    const bTypesRes = await request(app)
      .get('/api/document-types')
      .set('Authorization', `Bearer ${familyB.accessToken}`);
    expect(bTypesRes.body.items.find((t) => t.id === bDocType.body.id)?.name).toBe('B Only Type');

    // --- A refresh token minted for family A can never be redeemed to act as family B ---
    // (rotation looks up membership by the token's own stored userId/familyId, not anything the
    // client can influence, so this is really just re-confirming no cross-account leakage.)
    const refreshA = await request(app).post('/api/auth/refresh').send({ refreshToken: familyA.refreshToken });
    expect(refreshA.status).toBe(200);
  });
});
