import { useQuery } from '@tanstack/react-query';
import Drawer from '@/components/ui/Drawer.jsx';
import Spinner from '@/components/ui/Spinner.jsx';
import EmptyState from '@/components/ui/EmptyState.jsx';
import { sharesApi } from '@/services/sharesApi.js';

/**
 * ShareAccessLogDrawer — `GET /shares/:id/access-log` viewer, side panel.
 * Props: isOpen, onClose, shareId, shareLabel? (for the drawer title).
 */
export default function ShareAccessLogDrawer({ isOpen, onClose, shareId, shareLabel }) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['share-access-log', shareId],
    queryFn: () => sharesApi.accessLog(shareId),
    enabled: isOpen && !!shareId,
  });

  const items = data?.items || [];

  return (
    <Drawer isOpen={isOpen} onClose={onClose} side="right" title={shareLabel ? `Access log — ${shareLabel}` : 'Access log'}>
      <div className="p-4">
        {isLoading ? (
          <div className="flex justify-center py-10">
            <Spinner />
          </div>
        ) : isError ? (
          <p className="text-sm text-red-600 dark:text-red-400">Could not load the access log.</p>
        ) : items.length === 0 ? (
          <EmptyState variant="plain" title="No activity yet" description="Opens and downloads of this link will show up here." />
        ) : (
          <ul className="space-y-3">
            {items.map((entry, i) => (
              <li key={`${entry.time}-${i}`} className="text-sm border-b border-neutral-100 dark:border-neutral-800 pb-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-neutral-900 dark:text-neutral-100 capitalize">{entry.action}</span>
                  <span className="text-xs text-neutral-500 dark:text-neutral-400 flex-shrink-0">
                    {new Date(entry.time).toLocaleString()}
                  </span>
                </div>
                <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
                  {[entry.device, entry.browser].filter(Boolean).join(' · ') || 'Unknown device'}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Drawer>
  );
}
