import { Membership } from '../models/Membership.js';

/**
 * Display names of a family's members by membership id — for "Added by" / "Last changed by" on
 * the item and document pages. Unknown or empty ids are skipped; ids of another family never
 * resolve (the lookup is family-scoped).
 *
 * @returns {Promise<Map<string, string>>} membershipId -> name
 */
export async function memberNames(familyId, ids) {
  const wanted = [...new Set(ids.filter(Boolean).map(String))];
  if (!wanted.length) return new Map();
  const rows = await Membership.find({ familyId, _id: { $in: wanted } }, { name: 1 }).lean();
  return new Map(rows.map((m) => [String(m._id), m.name]));
}

/** `{ createdByName, updatedByName }` for a detail response (null when not known). */
export async function authorNames(familyId, record) {
  const names = await memberNames(familyId, [record.createdBy, record.updatedBy]);
  return {
    createdByName: (record.createdBy && names.get(String(record.createdBy))) || null,
    updatedByName: (record.updatedBy && names.get(String(record.updatedBy))) || null,
  };
}
