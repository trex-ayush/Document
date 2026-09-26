/**
 * The one "Access" choice shown for a member (member panel, Add member form), mapped to and from
 * the Membership's `role` + `access`:
 *  - 'read'  → role member, access read  ("Can view only")
 *  - 'write' → role member, access write ("Can add, edit and share")
 *  - 'admin' → role admin (always write)  ("Can also invite and manage members" — a family admin)
 */
export const LEVEL_PAYLOAD = {
  read: { role: 'member', access: 'read' },
  write: { role: 'member', access: 'write' },
  admin: { role: 'admin', access: 'write' },
};

/** The level a Membership has today. */
export const levelOf = (m) => (m?.role === 'admin' ? 'admin' : m?.access === 'read' ? 'read' : 'write');

/** ChoiceGroup options for the three levels (`t` bound to the members namespace). */
export const levelOptions = (t) => [
  { value: 'read', label: t('members:form.levelRead', 'Can view only'), tip: t('members:tip.levelRead', 'They can look, but not change') },
  { value: 'write', label: t('members:form.levelWrite', 'Can add, edit and share'), tip: t('members:tip.levelWrite', 'They can add, change and share') },
  {
    value: 'admin',
    label: t('members:form.levelAdmin', 'Can also invite and manage members'),
    hint: t('members:form.levelAdminHint', 'Can invite people, change their access and edit family settings.'),
    tip: t('members:tip.levelAdmin', 'They can also add people'),
  },
];
