/**
 * Each folder's own colour (folder cards, folder rows): the family's Shared folder is always the
 * brand coral; the others get colours from a fixed palette, handed out among siblings in creation
 * order (see siblingColors), so they don't repeat and a folder keeps its colour after a rename. Class strings are written out in
 * full so Tailwind generates them.
 *
 *  - icon: the folder icon, filled in its colour (a lighter fill inside a stronger outline)
 *  - wave: the soft wave along the bottom of a folder card
 */
const SHARED = {
  icon: 'text-primary-500 fill-primary-300 dark:text-primary-400 dark:fill-primary-400/80',
  wave: 'fill-primary-400/15 dark:fill-primary-400/15',
};

const PALETTE = [
  {
    icon: 'text-amber-500 fill-amber-300 dark:text-amber-400 dark:fill-amber-400/80',
    wave: 'fill-amber-400/15 dark:fill-amber-400/12',
  },
  {
    icon: 'text-blue-500 fill-blue-300 dark:text-blue-400 dark:fill-blue-400/80',
    wave: 'fill-blue-400/15 dark:fill-blue-400/12',
  },
  {
    icon: 'text-emerald-500 fill-emerald-300 dark:text-emerald-400 dark:fill-emerald-400/80',
    wave: 'fill-emerald-400/15 dark:fill-emerald-400/12',
  },
  {
    icon: 'text-violet-500 fill-violet-300 dark:text-violet-400 dark:fill-violet-400/80',
    wave: 'fill-violet-400/15 dark:fill-violet-400/12',
  },
  {
    icon: 'text-sky-500 fill-sky-300 dark:text-sky-400 dark:fill-sky-400/80',
    wave: 'fill-sky-400/15 dark:fill-sky-400/12',
  },
  {
    icon: 'text-rose-500 fill-rose-300 dark:text-rose-400 dark:fill-rose-400/80',
    wave: 'fill-rose-400/15 dark:fill-rose-400/12',
  },
  {
    icon: 'text-teal-500 fill-teal-300 dark:text-teal-400 dark:fill-teal-400/80',
    wave: 'fill-teal-400/15 dark:fill-teal-400/12',
  },
  {
    icon: 'text-orange-500 fill-orange-300 dark:text-orange-400 dark:fill-orange-400/80',
    wave: 'fill-orange-400/15 dark:fill-orange-400/12',
  },
];

/** A small, stable string hash (FNV-1a) — the fallback when a folder is shown without its siblings. */
function hash(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * Colours for a set of sibling folders, so siblings never share one while there are 8 or fewer:
 * Shared is coral, the others take the palette in creation order (a MongoDB id starts with its
 * creation time, so sorting ids is creation order — and stays the same after a rename). Home,
 * Browse and the folder picker all pass the same sibling list, so a folder has the same colour
 * everywhere. Returns a Map of folder id → colour.
 */
export function siblingColors(folders = []) {
  const map = new Map();
  folders
    .filter((f) => f && !f.isSystem)
    .map((f) => String(f.id))
    .sort()
    .forEach((id, i) => map.set(id, PALETTE[i % PALETTE.length]));
  return map;
}

/** A folder's colour: from its siblings' map when given, else a stable fallback from its id. */
export function folderColor(folder, colors) {
  if (!folder || folder.isSystem) return SHARED;
  return colors?.get(String(folder.id)) || PALETTE[hash(String(folder.id || folder.name || '')) % PALETTE.length];
}
