import { Family } from '../../models/Family.js';

/** Sum the actual stored byte size of each key (original + thumb) still present in storage. */
export async function totalStoredBytes(storage, keys) {
  const present = keys.filter(Boolean);
  const stats = await Promise.all(present.map((k) => storage.stat(k).catch(() => null)));
  return stats.reduce((sum, s) => sum + (s?.size || 0), 0);
}

/**
 * `Family.storageBytes` (see docs/API.md GET /stats) is a from-now-on running counter — not
 * backfilled/reconciled against pre-existing rows, just kept accurate for every file
 * add/replace/delete from here on, across both the documents and folders (recursive delete)
 * modules.
 */
export async function adjustFamilyStorageBytes(familyId, delta) {
  if (!delta) return;
  await Family.updateOne({ _id: familyId }, { $inc: { storageBytes: delta } });
}
