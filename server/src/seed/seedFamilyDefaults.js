import { Folder } from '../models/Folder.js';
import { DocumentType } from '../models/DocumentType.js';
import { DEFAULT_FOLDERS } from './defaultFolders.js';
import { DEFAULT_DOCUMENT_TYPES } from './defaultDocumentTypes.js';

/**
 * Seed default folders + document type templates for a brand-new family. Called exactly once,
 * from the signup service right after Family + owning User + Membership are created — never
 * triggered by any HTTP route.
 *
 * Idempotent-safe: only creates what's missing (checked by name), so calling it twice for the
 * same family never duplicates folders/types. That's a defensive property, not something the
 * normal signup flow relies on (signup only ever calls this once, for a brand-new familyId).
 */
export async function seedFamilyDefaults({ familyId, membershipId }) {
  const folderByName = new Map();

  const existingFolders = await Folder.find({ familyId, parentId: null }, 'name').lean();
  for (const f of existingFolders) folderByName.set(f.name, f._id);

  // Sequential (not Promise.all) so a rerun's "already exists" check for later folders reflects
  // folders this same call just created, and so failures don't leave a half-created batch racing.
  for (const name of DEFAULT_FOLDERS) {
    if (folderByName.has(name)) continue;
    // eslint-disable-next-line no-await-in-loop
    const folder = await Folder.create({ familyId, name, parentId: null, createdBy: membershipId });
    folderByName.set(name, folder._id);
  }

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
      defaultFolderId: folderByName.get(def.folder) || null,
      fields: def.fields,
      isSystem: true,
    });
  }
}
