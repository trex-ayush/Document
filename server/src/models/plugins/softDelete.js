import mongoose from 'mongoose';

/**
 * Soft-delete plugin (docs/DECISIONS.md "Soft delete / recycle bin"). Adds `deletedAt`/
 * `deletedBy` to a schema and transparently excludes soft-deleted rows from every
 * find/findOne/count/update UNLESS the caller's own filter already mentions `deletedAt` — that's
 * what makes "every list/query/count site excludes the bin" a structural guarantee instead of
 * something that has to be remembered at every one of the many `Document.find`/`Folder.find`/
 * `VaultItem.find` call sites across the app (folder tree, breadcrumbs, search, stats, shares,
 * public share resolution, ...).
 *
 * A query that already references `deletedAt` explicitly is left completely untouched — this is
 * the opt-out mechanism, deliberately without a separate `includeDeleted` query option: the Bin
 * module's own lookups filter FOR `deletedAt: { $ne: null }` (list the bin) or bypass with
 * `ANY_DELETED_STATE` (used when a lookup needs to find a row regardless of its deleted state,
 * e.g. walking a folder's ancestor chain during restore). Soft-deleting a row itself needs no
 * special handling either: the row being deleted is still active (`deletedAt: null`) at the
 * moment its own `_id` filter is matched.
 *
 * Legacy rows: every document/folder/item created before this plugin shipped has NO `deletedAt`
 * field at all in MongoDB (schema defaults only apply to documents Mongoose itself creates or
 * saves; `.lean()` reads never add them). The default `{ deletedAt: null }` filter already
 * matches a missing field, and `{ $ne: null }` already excludes one, so both are correct as-is —
 * but the bypass must also match a missing field, which is why it is NOT `$exists: true`.
 */

/**
 * "Match regardless of deleted state" — missing, null, or any date. `$nin: []` ("not in the empty
 * set") matches every row including ones where the field is absent, while still being a
 * `deletedAt` key the query hook can see. (`$ne: false` would be equivalent in raw MongoDB but
 * Mongoose refuses to cast a boolean to a Date path and throws a CastError.)
 */
export const ANY_DELETED_STATE = { deletedAt: { $nin: [] } };

function hasDeletedAtCondition(filter) {
  return Boolean(filter) && Object.prototype.hasOwnProperty.call(filter, 'deletedAt');
}

const QUERY_MIDDLEWARE = [
  'find',
  'findOne',
  'findOneAndUpdate',
  'findOneAndDelete',
  'countDocuments',
  'updateMany',
  'updateOne',
];

export function softDeletePlugin(schema) {
  schema.add({
    deletedAt: { type: Date, default: null, index: true },
    deletedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Membership', default: null },
  });

  schema.pre(QUERY_MIDDLEWARE, function excludeSoftDeleted(next) {
    if (!hasDeletedAtCondition(this.getFilter())) {
      this.where({ deletedAt: null });
    }
    next();
  });
}

/**
 * Idempotent startup backfill: gives every pre-soft-delete row an explicit `deletedAt: null` /
 * `deletedBy: null`, so the stored data matches the schema shape (for ad-hoc DB queries, exports,
 * and any future code). Correctness does NOT depend on it — every query path already treats a
 * missing field as "active" — so a failure is logged and ignored rather than blocking startup.
 * After the first run it matches nothing and is a cheap indexed no-op on every later boot.
 */
export async function backfillDeletedAt(models) {
  const results = {};
  for (const Model of models) {
    // eslint-disable-next-line no-await-in-loop
    const res = await Model.updateMany(
      { deletedAt: { $exists: false } },
      { $set: { deletedAt: null, deletedBy: null } },
    );
    results[Model.modelName] = res.modifiedCount;
  }
  return results;
}
