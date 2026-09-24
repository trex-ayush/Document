import { useState } from 'react';
import toast from 'react-hot-toast';
import { useAuth } from '@/context/AuthContext.jsx';
import { Dropdown } from '@/components/ui/Dropdown.jsx';
import Modal from '@/components/ui/Modal.jsx';
import Button from '@/components/ui/Button.jsx';
import Input from '@/components/ui/Input.jsx';
import { ChevronDownIcon, PlusIcon } from './icons.jsx';

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

function membershipLabel(m) {
  if (m.isOwner) return 'Owner';
  if (m.role === 'admin') return 'Admin';
  return m.access === 'write' ? 'Member' : 'Member · Read only';
}

function CheckIcon({ className = 'w-4 h-4' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
    </svg>
  );
}

/**
 * Shared list body: one row per membership (color dot, family name, role/
 * access badge, checkmark on the active one) + "+ Create a new family".
 * `onSelect(familyId)` / `onCreateClick()` — the caller (Dropdown panel or
 * Modal body) decides what "close the switcher" means for its own chrome.
 */
function FamilySwitcherList({ memberships, activeFamilyId, onSelect, onCreateClick }) {
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
              className={`w-full flex items-center gap-3 px-3.5 py-2.5 text-left text-sm transition-colors ${
                isActive
                  ? 'bg-neutral-50 dark:bg-neutral-700/60'
                  : 'hover:bg-neutral-50 dark:hover:bg-neutral-700/60'
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
                <span className="block text-xs text-neutral-500 dark:text-neutral-400">{membershipLabel(m)}</span>
              </span>
              {isActive && <CheckIcon className="w-4 h-4 text-primary-600 dark:text-primary-400 flex-shrink-0" />}
            </button>
          );
        })}
      </div>
      <div className="border-t border-neutral-100 dark:border-neutral-700 py-1.5">
        <button
          type="button"
          onClick={onCreateClick}
          className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-left text-sm font-medium text-neutral-900 dark:text-neutral-100 hover:bg-neutral-50 dark:hover:bg-neutral-700/60 transition-colors"
        >
          <PlusIcon className="w-4 h-4 text-neutral-500 dark:text-neutral-400" />
          Create a new family
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
      setError('Family name is required');
      return;
    }
    setError('');
    setSubmitting(true);
    try {
      await createFamily(trimmed);
      toast.success(`Created "${trimmed}"`);
      reset();
      onClose();
      window.location.reload();
    } catch (err) {
      setError(err?.response?.data?.message || 'Could not create the family. Please try again.');
      setSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="Create a new family"
      description="Start a separate vault for another household — you can switch between them anytime."
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={handleClose} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={handleCreate} loading={submitting}>
            Create
          </Button>
        </>
      }
    >
      <Input
        label="Family name"
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="The Singh Family"
        error={error}
      />
    </Modal>
  );
}

/**
 * Modal-based switcher — `isOpen`/`onClose` pair for a caller (MobileDrawer)
 * that opens it from its own trigger UI rather than embedding the Dropdown
 * trigger directly.
 */
export function FamilySwitcherModal({ isOpen, onClose }) {
  const { memberships, activeFamilyId, switchFamily } = useAuth();
  const [createOpen, setCreateOpen] = useState(false);

  return (
    <>
      <Modal isOpen={isOpen} onClose={onClose} title="Switch family" size="sm">
        <div className="-mx-6 -my-5">
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
      </Modal>
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
  const { memberships, activeFamilyId, activeFamily, switchFamily } = useAuth();
  const [createOpen, setCreateOpen] = useState(false);

  if (!activeFamily) {
    return (
      <span className={`text-base sm:text-lg font-semibold text-neutral-900 dark:text-neutral-100 truncate ${className}`}>
        Family Vault
      </span>
    );
  }

  return (
    <>
      <Dropdown
        align="left"
        className="min-w-[260px]"
        trigger={
          <span
            className={`flex items-center gap-2 px-1.5 py-1.5 -mx-1.5 rounded-xl hover:bg-neutral-50 dark:hover:bg-neutral-700 transition-colors ${className}`}
          >
            <span
              className="w-2.5 h-2.5 rounded-full flex-shrink-0 hidden sm:block"
              style={{ backgroundColor: dotColor(activeFamily.id) }}
              aria-hidden="true"
            />
            <span className="text-base sm:text-lg font-semibold text-neutral-900 dark:text-neutral-100 truncate max-w-[140px] sm:max-w-[220px]">
              {activeFamily.name}
            </span>
            <ChevronDownIcon className="w-4 h-4 text-neutral-400 flex-shrink-0" />
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
