/**
 * Design tokens — the one set of layout, spacing, type and colour classes every page and
 * primitive uses (docs/UI_KIT.md "Design standard"). Reach for these (or the primitive that
 * already uses them) instead of re-typing class lists, so pages can't drift apart again.
 */

// ── Page layout ─────────────────────────────────────────────────────────────
/** One width for every signed-in page (Home, Folders, a form, Settings…). */
export const PAGE_WIDTH = 'max-w-5xl';
/** Page gutter. The phone tab bar is cleared by AppShell's own bottom padding on top of this. */
export const PAGE_PADDING = 'px-4 pt-4 pb-8 sm:px-6 sm:pt-6';

// ── Spacing scale ───────────────────────────────────────────────────────────
/** Between page sections (and below the page header). */
export const SECTION_GAP = 'space-y-4 sm:space-y-6';
/** Between cards/tiles in a grid. */
export const GRID_GAP = 'gap-3 sm:gap-4';
/** Between form fields. */
export const FIELD_GAP = 'space-y-4';
/** Inside a card (and a list row's side padding, so row text lines up with card text). */
export const CARD_PADDING = 'p-4 sm:p-5';

// ── Typography ──────────────────────────────────────────────────────────────
export const TEXT_TITLE = 'text-neutral-900 dark:text-neutral-100';
export const TEXT_BODY = 'text-neutral-700 dark:text-neutral-300';
export const TEXT_MUTED = 'text-neutral-500 dark:text-neutral-400';
/** Section title (h2) inside a page or card. */
export const SECTION_TITLE = `text-base font-semibold ${TEXT_TITLE}`;
/** Small uppercase label above a group of rows ("Folders", "Documents"). */
export const GROUP_LABEL = `text-xs font-semibold uppercase tracking-wide ${TEXT_MUTED}`;

/** Inline text link (coral, underline on hover, focus ring) — "See all", "Forgot password?". */
export const TEXT_LINK =
  'rounded-sm font-medium text-primary-600 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-400 dark:text-primary-400';

// ── Surfaces ────────────────────────────────────────────────────────────────
export const CARD_SURFACE =
  'rounded-xl border border-neutral-200 bg-white shadow-card dark:border-neutral-700 dark:bg-neutral-800';
export const ROW_HOVER = 'hover:bg-neutral-50 dark:hover:bg-neutral-700/50';
export const ROW_ACTIVE = 'bg-neutral-100 dark:bg-neutral-700';

// ── Form controls ───────────────────────────────────────────────────────────
export const FIELD_LABEL = 'mb-1.5 block text-sm font-medium text-neutral-700 dark:text-neutral-300';
export const FIELD_HINT = `mt-1.5 text-xs ${TEXT_MUTED}`;
export const FIELD_ERROR = 'mt-1.5 text-xs text-red-600 dark:text-red-400';
/** Text input / select / textarea box. Same height as a default Button. */
export const FIELD_CONTROL =
  'w-full min-h-11 lg:min-h-10 rounded-lg border bg-white px-3 py-2 text-sm text-neutral-900 placeholder-neutral-400 transition-colors focus:outline-none focus:ring-3 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-neutral-900 dark:text-neutral-100 dark:placeholder-neutral-500';
export const FIELD_BORDER =
  'border-neutral-300 focus:border-neutral-400 focus:ring-neutral-400/20 dark:border-neutral-600 dark:focus:border-neutral-500 dark:focus:ring-neutral-500/20';
export const FIELD_BORDER_ERROR = 'border-red-400 focus:border-red-500 focus:ring-red-500/15 dark:border-red-600';

// ── Selectable controls ─────────────────────────────────────────────────────
/** Segmented control (tabs, language, theme, grid/list): a track with a raised active segment. */
export const SEGMENT_TRACK = 'rounded-lg bg-neutral-100 p-1 dark:bg-neutral-900';
export const segmentItem = (active) =>
  `rounded-md font-medium transition-colors ${
    active
      ? 'bg-white text-neutral-900 shadow-sm dark:bg-neutral-700 dark:text-neutral-100'
      : 'text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100'
  }`;
/** A bordered choice (one of several options, e.g. a share duration or a sign-in method). */
export const choiceItem = (active) =>
  `min-h-11 rounded-lg border px-3 text-sm font-medium transition-colors ${
    active
      ? 'border-primary-500 bg-primary-50 text-primary-700 dark:bg-primary-900/20 dark:text-primary-300'
      : 'border-neutral-200 bg-white text-neutral-700 hover:border-neutral-300 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:border-neutral-600'
  }`;
/** Active item in a navigation list (sidebar, More menu). */
export const NAV_ACTIVE = 'bg-primary-50 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300';
export const NAV_IDLE =
  'text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900 dark:text-neutral-400 dark:hover:bg-neutral-700/50 dark:hover:text-neutral-100';

// ── Kind colours and item icons ─────────────────────────────────────────────
/**
 * Item icons, Google Drive / iOS Files style: no background square — the icon itself carries the
 * kind colour, a -500/-600 outline with a soft -50/-100 fill inside (dark: -400 outline, a
 * see-through fill). The same colours everywhere a kind appears (rows, folder cards, search, Bin).
 * `pdf` is for a file known to be a PDF; `document` is any document (a coloured page).
 */
export const KIND_ICON = {
  folder: 'text-primary-500 fill-primary-100 dark:text-primary-400 dark:fill-primary-400/20',
  document: 'text-blue-600 fill-blue-50 dark:text-blue-400 dark:fill-blue-400/15',
  pdf: 'text-red-600 fill-red-50 dark:text-red-400 dark:fill-red-400/15',
  password: 'text-sky-600 fill-sky-100 dark:text-sky-400 dark:fill-sky-400/20',
  note: 'text-violet-600 fill-violet-100 dark:text-violet-400 dark:fill-violet-400/20',
  member: 'text-neutral-500 fill-neutral-100 dark:text-neutral-400 dark:fill-neutral-600/40',
};
/** An item icon in a row: 28px in a 32px slot, stroke 1.75 (pass `strokeWidth={1.75}`). */
export const ITEM_ICON = 'h-7 w-7 flex-shrink-0';
/** An item icon on a card (Home folder cards): 40px. */
export const ITEM_ICON_LG = 'h-10 w-10 flex-shrink-0';
