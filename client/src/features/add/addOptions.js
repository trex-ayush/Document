import { Camera, KeyRound, StickyNote, Upload } from 'lucide-react';

/**
 * The four things a person can add, in menu order. `labelKey`/`hintKey` are `common:` keys;
 * `label`/`hint` are the English fallbacks.
 */
export const ADD_OPTIONS = [
  {
    key: 'document',
    icon: Upload,
    labelKey: 'addMenu.document',
    label: 'Upload document',
    hintKey: 'addMenu.documentHint',
    hint: 'A PDF or photo from this device',
  },
  {
    key: 'photo',
    icon: Camera,
    labelKey: 'addMenu.photo',
    label: 'Take photo',
    hintKey: 'addMenu.photoHint',
    hint: 'Use the camera to snap a document',
  },
  {
    key: 'password',
    icon: KeyRound,
    labelKey: 'addMenu.password',
    label: 'Save password',
    hintKey: 'addMenu.passwordHint',
    hint: 'A login for a website, app or bank',
  },
  {
    key: 'note',
    icon: StickyNote,
    labelKey: 'addMenu.note',
    label: 'Write note',
    hintKey: 'addMenu.noteHint',
    hint: 'Anything you want to remember',
  },
];

const BASE_PATHS = {
  document: '/add/document',
  photo: '/add/document',
  password: '/add/password',
  note: '/add/note',
};

/** Route for an add option, carrying the folder (if any) and `capture=1` for the camera. */
export function addPath(key, folderId) {
  const base = BASE_PATHS[key];
  if (!base) throw new Error(`Unknown add option: ${key}`);
  const params = new URLSearchParams();
  if (folderId) params.set('folderId', folderId);
  if (key === 'photo') params.set('capture', '1');
  const query = params.toString();
  return query ? `${base}?${query}` : base;
}
