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
 * `deletedAt: { $exists: true }` (a condition every row always matches, since this field always
 * exists once the plugin is applied — used when a lookup needs to find a row regardless of its
 * deleted state, e.g. walking a folder's ancestor chain during restore). Soft-deleting a row
 * itself needs no special handling either: the row being deleted is still active
 * (`deletedAt: null`) at the moment its own `_id` filter is matched.
 */
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
