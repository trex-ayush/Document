import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

import PageHeader from '@/components/ui/PageHeader.jsx';
import SearchInput from '@/components/ui/SearchInput.jsx';
import Button from '@/components/ui/Button.jsx';
import Spinner from '@/components/ui/Spinner.jsx';
import EmptyState from '@/components/ui/EmptyState.jsx';
import Dropdown, { DropdownItem } from '@/components/ui/Dropdown.jsx';
import { KeyIcon, HashIcon, NoteIcon, PlusIcon } from '@/components/layout/icons.jsx';

import itemsApi from '@/services/itemsApi.js';
import ItemCard from '@/features/items/ItemCard.jsx';

/** Debounces a fast-changing value (search box keystrokes) before it drives a query key. */
function useDebounced(value, delay = 300) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

/**
 * `/items` — all-items list. Not in the original build-plan route list (only `/items/new`,
 * `/items/:id`, `/items/:id/edit` were specified), added because Browse (a later-phase page,
 * `client/src/routes/AppRouter.jsx`) doesn't exist yet and there would otherwise be no way to find
 * an item again after creating it — see docs/ITEMS.md "Client".
 */
export default function ItemsList() {
  const { t } = useTranslation('items');
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [kind, setKind] = useState('');
  const debouncedQ = useDebounced(q);

  const KIND_TABS = [
    { value: '', label: t('kindTabs.all', 'All') },
    { value: 'login', label: t('kindTabs.login', 'Logins') },
    { value: 'record', label: t('kindTabs.record', 'Records') },
    { value: 'note', label: t('kindTabs.note', 'Notes') },
  ];

  const { data, isLoading } = useQuery({
    queryKey: ['items', { q: debouncedQ, kind }],
    queryFn: () => itemsApi.list({ q: debouncedQ || undefined, kind: kind || undefined, limit: 60 }),
  });

  const items = data?.items || [];

  return (
    <div>
      <PageHeader
        title={t('list.title', 'Items')}
        subtitle={t('list.subtitle', 'Passwords, numbers, and secure notes')}
        actions={
          <Dropdown
            trigger={
              // Dropdown wraps `trigger` in its own <button> — render this as a <span> (not
              // Button's default <button>) so we don't end up with an invalid nested button.
              <Button as="span" leftIcon={<PlusIcon className="w-4 h-4" />}>
                {t('list.addItem', 'Add item')}
              </Button>
            }
          >
            <DropdownItem onSelect={() => navigate('/items/new?kind=login')}>
              <span className="inline-flex items-center gap-2"><KeyIcon className="w-4 h-4" /> {t('kinds.login', 'Password / login')}</span>
            </DropdownItem>
            <DropdownItem onSelect={() => navigate('/items/new?kind=record')}>
              <span className="inline-flex items-center gap-2"><HashIcon className="w-4 h-4" /> {t('kinds.record', 'Number / record')}</span>
            </DropdownItem>
            <DropdownItem onSelect={() => navigate('/items/new?kind=note')}>
              <span className="inline-flex items-center gap-2"><NoteIcon className="w-4 h-4" /> {t('kinds.note', 'Secure note')}</span>
            </DropdownItem>
          </Dropdown>
        }
      />

      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <SearchInput value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('list.searchPlaceholder', 'Search items...')} wrapperClassName="sm:max-w-xs" />
        <div className="flex gap-1.5 flex-wrap">
          {KIND_TABS.map((tab) => (
            <Button key={tab.value} size="sm" variant={kind === tab.value ? 'primary' : 'secondary'} onClick={() => setKind(tab.value)}>
              {tab.label}
            </Button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16">
          <Spinner size="lg" />
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={<KeyIcon className="w-12 h-12" />}
          title={q || kind ? t('list.noMatchingTitle', 'No matching items') : t('list.emptyTitle', 'Nothing saved yet')}
          description={
            q || kind
              ? t('list.noMatchingDescription', 'Try a different search or filter.')
              : t('list.emptyDescription', 'Add a password, number, or secure note to get started.')
          }
          action={!q && !kind && <Button as={Link} to="/items/new">{t('list.addFirstItem', 'Add your first item')}</Button>}
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {items.map((item) => (
            <ItemCard key={item.id} item={item} />
          ))}
        </div>
      )}
    </div>
  );
}
