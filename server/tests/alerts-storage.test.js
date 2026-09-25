import './helpers/setupEnv.js';
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import sharp from 'sharp';
import mongoose from 'mongoose';
import { startTestDb, stopTestDb, clearDb } from './helpers/db.js';
import { buildApp, signupFamily } from './helpers/factory.js';
import { Family } from '../src/models/Family.js';
import { PlatformSettings } from '../src/models/PlatformSettings.js';
import { env } from '../src/config/env.js';

// Boundary mock: alerts.js calls `sendMail` from services/mailer.js.
const mockSendMail = vi.fn();
vi.mock('../src/services/mailer.js', () => ({
  sendMail: (...args) => mockSendMail(...args),
  isEmailEnabled: () => false,
}));

const { _resetAlertStateForTests } = await import('../src/services/alerts.js');

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
  mockSendMail.mockReset();
  _resetAlertStateForTests();
});

async function waitForMailCalls(min = 1, timeoutMs = 15000) {
  const start = Date.now();
  while (mockSendMail.mock.calls.length < min && Date.now() - start < timeoutMs) {
    // eslint-disable-next-line no-await-in-loop
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}

async function pngBuffer() {
  return sharp({ create: { width: 12, height: 8, channels: 3, background: { r: 10, g: 200, b: 60 } } })
    .png()
    .toBuffer();
}

// STORAGE_LIMIT_MB defaults to 512 (way more than a tiny test upload could ever cross), so these
// tests pre-seed `Family.storageBytes` directly (bypassing the upload flow) to just under a
// threshold, then perform one small real upload — the ordinary `document.create` activity is
// what triggers alerts.js's storage check, but the crossing itself is deterministic regardless of
// exactly how many bytes the tiny test PNG happens to compress to.
async function seedStorageBytesJustUnder(familyId, fraction, limitMB = env.STORAGE_LIMIT_MB) {
  const limitBytes = limitMB * 1024 * 1024;
  await Family.updateOne({ _id: familyId }, { storageBytes: Math.floor(limitBytes * fraction) - 10 });
}

describe('admin instant alerts — storage threshold', () => {
  it('emails the admin once storage crosses 80%', async () => {
    const s = await signupFamily(app);
    const folder = await request(app).post('/api/folders').set('Authorization', `Bearer ${s.accessToken}`).set('X-Family-Id', s.familyId).send({ name: 'Docs', parentId: 'root' });
    await seedStorageBytesJustUnder(s.family.id, 0.8);

    await request(app)
      .post('/api/documents')
      .set('Authorization', `Bearer ${s.accessToken}`).set('X-Family-Id', s.familyId)
      .field('data', JSON.stringify({ title: 'Big-ish file', folderId: folder.body.id }))
      .field('labels', JSON.stringify(['x']))
      .attach('files', await pngBuffer(), { filename: 'x.png', contentType: 'image/png' })
      .expect(201);

    await waitForMailCalls(1);

    expect(mockSendMail).toHaveBeenCalledTimes(1);
    expect(mockSendMail.mock.calls[0][0].subject).toContain('80%');
  });

  it('does not re-alert at 80% twice, but does alert once at 95%', async () => {
    const s = await signupFamily(app);
    const folder = await request(app).post('/api/folders').set('Authorization', `Bearer ${s.accessToken}`).set('X-Family-Id', s.familyId).send({ name: 'Docs', parentId: 'root' });

    await seedStorageBytesJustUnder(s.family.id, 0.8);
    await request(app)
      .post('/api/documents')
      .set('Authorization', `Bearer ${s.accessToken}`).set('X-Family-Id', s.familyId)
      .field('data', JSON.stringify({ title: 'First', folderId: folder.body.id }))
      .field('labels', JSON.stringify(['x']))
      .attach('files', await pngBuffer(), { filename: 'x.png', contentType: 'image/png' })
      .expect(201);
    await waitForMailCalls(1);
    expect(mockSendMail).toHaveBeenCalledTimes(1);

    // Still under 95% — a second upload shouldn't re-fire the 80% alert.
    await request(app)
      .post('/api/documents')
      .set('Authorization', `Bearer ${s.accessToken}`).set('X-Family-Id', s.familyId)
      .field('data', JSON.stringify({ title: 'Second', folderId: folder.body.id }))
      .field('labels', JSON.stringify(['x']))
      .attach('files', await pngBuffer(), { filename: 'x2.png', contentType: 'image/png' })
      .expect(201);
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(mockSendMail).toHaveBeenCalledTimes(1);

    // Now cross 95%.
    await seedStorageBytesJustUnder(s.family.id, 0.95);
    await request(app)
      .post('/api/documents')
      .set('Authorization', `Bearer ${s.accessToken}`).set('X-Family-Id', s.familyId)
      .field('data', JSON.stringify({ title: 'Third', folderId: folder.body.id }))
      .field('labels', JSON.stringify(['x']))
      .attach('files', await pngBuffer(), { filename: 'x3.png', contentType: 'image/png' })
      .expect(201);
    await waitForMailCalls(2);

    expect(mockSendMail).toHaveBeenCalledTimes(2);
    expect(mockSendMail.mock.calls[1][0].subject).toContain('95%');
  });

  it('does not email when well under the threshold', async () => {
    const s = await signupFamily(app);
    const folder = await request(app).post('/api/folders').set('Authorization', `Bearer ${s.accessToken}`).set('X-Family-Id', s.familyId).send({ name: 'Docs', parentId: 'root' });

    await request(app)
      .post('/api/documents')
      .set('Authorization', `Bearer ${s.accessToken}`).set('X-Family-Id', s.familyId)
      .field('data', JSON.stringify({ title: 'Tiny', folderId: folder.body.id }))
      .field('labels', JSON.stringify(['x']))
      .attach('files', await pngBuffer(), { filename: 'x.png', contentType: 'image/png' })
      .expect(201);
    await new Promise((resolve) => setTimeout(resolve, 300));

    expect(mockSendMail).not.toHaveBeenCalled();
  });

  describe('threshold is the platform admin setting (never per-family)', () => {
    async function uploadTiny(s, folderId) {
      await request(app)
        .post('/api/documents')
        .set('Authorization', `Bearer ${s.accessToken}`).set('X-Family-Id', s.familyId)
        .field('data', JSON.stringify({ title: 'Tiny', folderId }))
        .field('labels', JSON.stringify(['x']))
        .attach('files', await pngBuffer(), { filename: 'x.png', contentType: 'image/png' })
        .expect(201);
    }

    it('uses PlatformSettings.storageLimitMB when set', async () => {
      await PlatformSettings.findByIdAndUpdate('platform', { storageLimitMB: 1000 }, { upsert: true });
      const s = await signupFamily(app);
      const folder = await request(app).post('/api/folders').set('Authorization', `Bearer ${s.accessToken}`).set('X-Family-Id', s.familyId).send({ name: 'Docs', parentId: 'root' });
      await seedStorageBytesJustUnder(s.family.id, 0.8, 1000);

      await uploadTiny(s, folder.body.id);
      await waitForMailCalls(1);

      expect(mockSendMail).toHaveBeenCalledTimes(1);
      expect(mockSendMail.mock.calls[0][0].subject).toContain('80%');
      expect(mockSendMail.mock.calls[0][0].text).toContain('1000 MB');
    });

    it('ignores a stale, lower per-family storageLimitMB still stored in the DB', async () => {
      const s = await signupFamily(app);
      const folder = await request(app).post('/api/folders').set('Authorization', `Bearer ${s.accessToken}`).set('X-Family-Id', s.familyId).send({ name: 'Docs', parentId: 'root' });
      // A legacy override of 100 MB would put this family far past 95%; the env limit it really
      // resolves to leaves it at ~50%, so no alert must fire.
      await Family.collection.updateOne({ _id: new mongoose.Types.ObjectId(s.family.id) }, { $set: { 'settings.storageLimitMB': 100 } });
      await seedStorageBytesJustUnder(s.family.id, 0.5);

      await uploadTiny(s, folder.body.id);
      await new Promise((resolve) => setTimeout(resolve, 300));

      expect(mockSendMail).not.toHaveBeenCalled();
    });
  });
});
