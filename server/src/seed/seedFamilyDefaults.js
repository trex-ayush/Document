import { DocumentType } from '../models/DocumentType.js';
import { DEFAULT_DOCUMENT_TYPES } from './defaultDocumentTypes.js';

/**
 * Seed the default document type templates for a brand-new family. Called from `POST /family`
 * right after the Family + owning Membership are created — never triggered by any other route.
 *
 * No folders are created: a new family starts with an empty folder tree and makes its own
 * (documents and vault items can live at the top level, `folderId: null`, until it does). The
 * seeded types therefore have `defaultFolderId: null` — an admin can point one at a folder later
 * via `PATCH /document-types/:id`.
 *
 * Idempotent-safe: only creates what's missing (checked by name), so calling it twice for the
 * same family never duplicates types.
 */
export async function seedFamilyDefaults({ familyId }) {
  const existingTypeNames = new Set(
    (await DocumentType.find({ familyId }, 'name').lean()).map((t) => t.name),
  );

  for (const def of DEFAULT_DOCUMENT_TYPES) {
    if (existingTypeNames.has(def.name)) continue;
    // eslint-disable-next-line no-await-in-loop
    await DocumentType.create({
      familyId,
      name: def.name,
      icon: def.icon,
      defaultFolderId: null,
      fields: def.fields,
      isSystem: true,
    });
  }
}
