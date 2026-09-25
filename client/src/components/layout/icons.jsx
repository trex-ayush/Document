import { Ellipsis, Users } from 'lucide-react';

/**
 * Legacy icon names, kept ONLY for `pages/Members.jsx` (still imports `UsersIcon`/`MoreIcon`).
 * Every other file imports straight from `lucide-react` — the app's single icon source
 * (docs/UI_KIT.md §7.8). Both are lucide icons, so Members looks the same as everywhere else.
 * Delete this file once Members.jsx imports `Users`/`Ellipsis` from `lucide-react` itself.
 */
export const UsersIcon = (p) => <Users className="w-5 h-5" {...p} />;
export const MoreIcon = (p) => <Ellipsis className="w-5 h-5" {...p} />;
