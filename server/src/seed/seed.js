import { connectDB, disconnectDB } from '../db/connect.js';
import { Family } from '../models/Family.js';
import { Membership } from '../models/Membership.js';
import { seedFamilyDefaults } from './seedFamilyDefaults.js';

/**
 * Dev-convenience CLI (`npm run seed`): backfills default folders/document types for every
 * existing family that's missing them. Normal signup already calls seedFamilyDefaults directly
 * (see modules/auth/service.js) — this script is only for families created before this seed data
 * existed, or a dev DB populated some other way. Safe to re-run: seedFamilyDefaults only creates
 * what's missing, by name.
 */
async function main() {
  await connectDB();
  const families = await Family.find().lean();
  for (const family of families) {
    // eslint-disable-next-line no-await-in-loop
    const owner = await Membership.findOne({ familyId: family._id, isOwner: true }).lean();
    // eslint-disable-next-line no-await-in-loop
    await seedFamilyDefaults({ familyId: family._id, membershipId: owner?._id || null });
    // eslint-disable-next-line no-console
    console.log(`[seed] ensured defaults for "${family.name}" (${family.slug})`);
  }
  await disconnectDB();
  // eslint-disable-next-line no-console
  console.log(`[seed] done — ${families.length} family(ies) checked`);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('[seed] failed', err);
  process.exit(1);
});
