import { ensureSharedFolder } from '../modules/folders/sharedFolder.js';

/**
 * Sets up a brand-new family. Called from `POST /family` right after the Family + owning
 * Membership are created. Creates the one system folder every family has — "Shared" — and nothing
 * else (the app never creates per-member folders).
 *
 * Idempotent: calling it again for the same family never creates a second Shared folder.
 * `membershipId` is accepted for signature compatibility but not needed.
 */
// eslint-disable-next-line no-unused-vars
export async function seedFamilyDefaults({ familyId, membershipId } = {}) {
  await ensureSharedFolder(familyId);
}
