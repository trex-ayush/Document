/**
 * StatusPill — colored pill for a dynamic status value: a leading dot +
 * translucent (color+"20") background, text in the same color.
 *
 * Ported from apps/template/src/components/ui/StatusPill.jsx (there it was
 * driven by a project's `status.color` hex). Generalized here with a
 * `SHARE_STATUS` preset map + `shareStatusToStatus()` helper, since this
 * app's most common dynamic-status use is a Share's `active | expired |
 * revoked` (docs/API.md `GET /shares`) rather than project-config colors —
 * pass either a raw `{ color, name }` (original API) or a share status
 * string via the `shareStatus` prop.
 *
 * Props:
 *  - status?      { color: '#hex', name: 'Label' } — renders as-is
 *  - shareStatus?  'active' | 'expired' | 'revoked' — convenience alternative
 *                   to `status`, resolved through SHARE_STATUS below
 *  - size?        'sm' | 'md' (default)
 *  - className?
 *
 * @example
 * <StatusPill status={{ color: '#22C55E', name: 'Done' }} />
 * <StatusPill shareStatus={share.revokedAt ? 'revoked' : share.expired ? 'expired' : 'active'} size="sm" />
 */
export const SHARE_STATUS = {
  active: { color: '#16A34A', name: 'Active' },
  expired: { color: '#A8A29E', name: 'Expired' },
  revoked: { color: '#DC2626', name: 'Revoked' },
};

const StatusPill = ({ status, shareStatus, size = 'md', className = '' }) => {
  const resolved = status || (shareStatus ? SHARE_STATUS[shareStatus] : null);

  if (!resolved || !resolved.color) {
    return <span className={`text-sm text-neutral-400 ${className}`}>—</span>;
  }

  const sizeClasses =
    size === 'sm'
      ? 'gap-1 px-1.5 py-0.5 text-[10px]'
      : 'gap-1.5 pl-2 pr-2 sm:pr-3 py-1 text-xs sm:text-sm';

  const dotSize = size === 'sm' ? 'w-1.5 h-1.5' : 'w-2 h-2';

  return (
    <span
      className={`inline-flex items-center rounded-full font-medium ${sizeClasses} ${className}`}
      style={{ backgroundColor: `${resolved.color}20`, color: resolved.color }}
    >
      <span className={`${dotSize} rounded-full flex-shrink-0`} style={{ backgroundColor: resolved.color }} />
      <span className="truncate">{resolved.name}</span>
    </span>
  );
};

export default StatusPill;
