import { useState } from 'react';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/context/AuthContext.jsx';
import { Dropdown } from '@/components/ui/Dropdown.jsx';
import Drawer from '@/components/ui/Drawer.jsx';
import Button from '@/components/ui/Button.jsx';
import Input from '@/components/ui/Input.jsx';
import { Check, ChevronDown, Plus } from 'lucide-react';

/**
 * FamilySwitcher — multi-family accounts (docs/API.md "Multi-family
 * sessions", docs/DECISIONS.md "Multi-family accounts"): lets a user who
 * belongs to more than one family see which one is active and switch, or
 * create another. Interaction model ported from the reference design kit's
 * `apps/component/src/components/layout/OrganizationSwitcher.tsx` +
 * `CreateOrganizationModal.tsx` (hand-adapted to this app's simpler
 * single-column list — no search/quick-links column, our families list is
 * expected to be short — and to our own `Dropdown`/`Modal` primitives
 * instead of the reference's).
 *
 * Two entry points, both built on the same `FamilySwitcherList` +
 * `CreateFamilyModal`:
 *  - **default export `FamilySwitcher`** — the Navbar trigger (family name +
 *    chevron) wrapped in the `Dropdown` primitive (desktop-style popover).
 *  - **named export `FamilySwitcherModal`** — an `isOpen`/`onClose` pair
 *    wrapping the same list in the `Modal` primitive instead (which is
 *    itself mobile-adaptive — bottom sheet below `lg`). Used by
 *    `MobileDrawer.jsx`'s own family row: a `Dropdown`'s absolutely
 *    positioned panel nested inside a `Drawer`'s scrollable content risks
 *    getting clipped, so the drawer trigger opens this instead of nesting a
 *    second `Dropdown`.
 *
 * Both switch immediately via `useAuth().switchFamily` (which reloads the
 * page — see `AuthContext.jsx`'s doc comment for why) and both offer
 * "+ Create a new family" (`useAuth().createFamily`), opening
 * `CreateFamilyModal`.
 */

const DOT_COLORS = ['#EF4444', '#F59E0B', '#10B981', '#3B82F6', '#8B5CF6', '#EC4899', '#14B8A6', '#F97316'];

/** Stable per-family color dot, hashed from the family id — the same family always gets the same dot. */
function dotColor(id = '') {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return DOT_COLORS[hash % DOT_COLORS.length];
}

// Same cap as the server (server/src/modules/family/schemas.js) so the input stops where the API would.
export const FAMILY_NAME_MAX = 150;

function membershipLabel(m, t) {
  if (m.isOwner) return t('familySwitcher.owner', 'Owner');
  if (m.role === 'admin') return t('familySwitcher.admin', 'Admin');
  return m.access === 'write' ? t('familySwitcher.member', 'Member') : t('familySwitcher.memberReadOnly', 'Member · Read only');
}

/**
 * Shared list body: one row per membership (color dot, family name, role/
 * access badge, checkmark on the active one) + "+ Create a new family".
 * `onSelect(familyId)` / `onCreateClick()` — the caller (Dropdown panel or
 * Modal body) decides what "close the switcher" means for its own chrome.
 */
function FamilySwitcherList({ memberships, activeFamilyId, onSelect, onCreateClick }) {
  const { t } = useTranslation('common');
  return (
    <div>
      <div className="max-h-72 overflow-y-auto py-1.5">
        {memberships.map((m) => {
          const isActive = m.familyId === activeFamilyId;
          return (
            <button
              key={m.familyId}
              type="button"
              onClick={() => onSelect(m.familyId)}
              title={m.familyName}
              className={`flex w-full min-w-0 min-h-11 items-center gap-3 px-4 py-2.5 text-left text-sm transition-colors ${
                isActive ? 'bg-neutral-100 dark:bg-neutral-700' : 'hover:bg-neutral-50 dark:hover:bg-neutral-700/50'
              }`}
            >
              <span
                className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                style={{ backgroundColor: dotColor(m.familyId) }}
                aria-hidden="true"
              />
              <span className="flex-1 min-w-0">
                <span className="block font-medium text-neutral-900 dark:text-neutral-100 truncate">
                  {m.familyName}
                </span>
                <span className="block text-xs text-neutral-500 dark:text-neutral-400">{membershipLabel(m, t)}</span>
              </span>
              {isActive && <Check className="w-4 h-4 text-primary-600 dark:text-primary-400 flex-shrink-0" />}
            </button>
          );
        })}
      </div>
      <div className="border-t border-neutral-200 dark:border-neutral-700 py-1.5">
        <button
          type="button"
          onClick={onCreateClick}
          className="flex w-full min-h-11 items-center gap-3 px-4 py-2.5 text-left text-sm font-medium text-neutral-900 transition-colors hover:bg-neutral-50 dark:text-neutral-100 dark:hover:bg-neutral-700/50"
        >
          <Plus className="h-4 w-4 text-neutral-500 dark:text-neutral-400" aria-hidden="true" />
          {t('familySwitcher.createNew', 'Create a new family')}
        </button>
      </div>
    </div>
  );
}

/**
 * "Create a new family" — `POST /family` (`useAuth().createFamily`), then
 * makes it the active family. Reloads the page on success (same reasoning as
 * `switchFamily` — every page's family-scoped data needs to refetch under
 * the new context, and a full reload is the simple, unconditionally-correct
 * way to guarantee that without auditing every query key in the app).
 */
function CreateFamilyModal({ isOpen, onClose }) {
  const { t } = useTranslation('common');
  const { createFamily } = useAuth();
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const reset = () => {
    setName('');
    setError('');
    setSubmitting(false);
  };

  const handleClose = () => {
    if (submitting) return;
    reset();
    onClose();
  };

  const handleCreate = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setError(t('familySwitcher.nameRequired', 'Please type a name for the family'));
      return;
    }
    setError('');
    setSubmitting(true);
    try {
      await createFamily(trimmed);
      toast.success(t('familySwitcher.created', 'Created "{{name}}"', { name: trimmed }));
      reset();
      onClose();
      window.location.reload();
    } catch (err) {
      setError(err?.response?.data?.message || t('familySwitcher.createFailed', 'Could not create the family. Please try again.'));
      setSubmitting(false);
    }
  };

  return (
    <Drawer
      isOpen={isOpen}
      onClose={handleClose}
      title={t('familySwitcher.createNew', 'Create a new family')}
      description={t('familySwitcher.createDescription', 'Start a separate vault for another household — you can switch between them anytime.')}
      size="sm"
      side="right"
      footer={
        <>
          <Button variant="secondary" onClick={handleClose} disabled={submitting}>
            {t('actions.cancel', 'Cancel')}
          </Button>
          <Button onClick={handleCreate} loading={submitting}>
            {t('actions.create', 'Create')}
          </Button>
        </>
      }
    >
      <Input
        label={t('familySwitcher.nameLabel', 'Family name')}
        autoFocus
        value={name}
        maxLength={FAMILY_NAME_MAX}
        onChange={(e) => setName(e.target.value)}
        placeholder={t('familySwitcher.namePlaceholder', 'The Singh Family')}
        error={error}
      />
    </Drawer>
  );
}

/**
 * Modal-based switcher — `isOpen`/`onClose` pair for a caller (MobileDrawer)
 * that opens it from its own trigger UI rather than embedding the Dropdown
 * trigger directly.
 */
export function FamilySwitcherModal({ isOpen, onClose }) {
  const { t } = useTranslation('common');
  const { memberships, activeFamilyId, switchFamily } = useAuth();
  const [createOpen, setCreateOpen] = useState(false);

  return (
    <>
      <Drawer isOpen={isOpen} onClose={onClose} title={t('familySwitcher.switchTitle', 'Switch family')} size="sm" side="right" bodyClassName="">
        <div>
          <FamilySwitcherList
            memberships={memberships}
            activeFamilyId={activeFamilyId}
            onSelect={(familyId) => {
              onClose();
              switchFamily(familyId);
            }}
            onCreateClick={() => {
              onClose();
              setCreateOpen(true);
            }}
          />
        </div>
      </Drawer>
      <CreateFamilyModal isOpen={createOpen} onClose={() => setCreateOpen(false)} />
    </>
  );
}

/**
 * Navbar trigger — family name + chevron, opens a `Dropdown` popover listing
 * every membership. Falls back to plain "Family Vault" text (no dropdown)
 * when there's no active family yet (shouldn't happen inside `AppShell` in
 * practice — the router guard keeps a zero-membership user on Onboarding —
 * but guards against the brief window before the mount-time `GET /auth/me`
 * resolves).
 */
export default function FamilySwitcher({ className = '' }) {
  const { t } = useTranslation('common');
  const { memberships, activeFamilyId, activeFamily, switchFamily } = useAuth();
  const [createOpen, setCreateOpen] = useState(false);

  if (!activeFamily) {
    return (
      <span className={`min-w-0 text-base sm:text-lg font-semibold text-neutral-900 dark:text-neutral-100 truncate ${className}`}>
        {t('appName', 'Family Vault')}
      </span>
    );
  }

  return (
    <>
      {/* Long names (up to 150 chars): every flex level from the Navbar row down to the name
          span is min-w-0 so the name truncates into whatever room is left, instead of pushing
          the icon row off-screen. The panel is width-capped to the viewport for the same reason
          (its rows are nowrap/truncate, so an uncapped absolute panel grows to the text length). */}
      <Dropdown
        align="left"
        wrapperClassName="flex min-w-0 max-w-full"
        triggerClassName="flex min-w-0 max-w-full"
        className="w-72 max-w-[calc(100vw-5rem)] sm:w-80"
        trigger={
          <span
            title={activeFamily.name}
            className={`flex min-w-0 max-w-full min-h-11 items-center gap-2 rounded-lg px-1.5 py-1.5 transition-colors hover:bg-neutral-100 dark:hover:bg-neutral-700 ${className}`}
          >
            <span
              className="w-2.5 h-2.5 rounded-full flex-shrink-0 hidden sm:block"
              style={{ backgroundColor: dotColor(activeFamily.id) }}
              aria-hidden="true"
            />
            <span className="min-w-0 truncate text-base sm:text-lg font-semibold text-neutral-900 dark:text-neutral-100 md:max-w-[220px] lg:max-w-[320px]">
              {activeFamily.name}
            </span>
            <ChevronDown className="w-4 h-4 text-neutral-400 flex-shrink-0" />
          </span>
        }
      >
        <FamilySwitcherList
          memberships={memberships}
          activeFamilyId={activeFamilyId}
          onSelect={switchFamily}
          onCreateClick={() => setCreateOpen(true)}
        />
      </Dropdown>
      <CreateFamilyModal isOpen={createOpen} onClose={() => setCreateOpen(false)} />
    </>
  );
}
