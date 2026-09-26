import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Clock, Database, Mail, MemoryStick, RefreshCw } from 'lucide-react';
import Button from '@/components/ui/Button.jsx';
import Badge from '@/components/ui/Badge.jsx';
import StatCard from '@/components/ui/StatCard.jsx';
import { ErrorState, LoadingState, Notice } from '@/components/ui/PageState.jsx';
import { GRID_GAP } from '@/components/ui/tokens.js';
import { Section } from './adminShared.jsx';
import { adminOpsApi } from '@/services/adminOpsApi.js';

/** 1536 -> "1.5 KB". Plain Latin digits in both languages (same rule as i18n/formatters.js). */
function formatBytes(bytes) {
  const n = Number(bytes);
  if (!Number.isFinite(n) || n < 0) return '—';
  if (n < 1024) return `${n} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = n / 1024;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i += 1;
  }
  return `${value >= 100 ? Math.round(value) : value.toFixed(1)} ${units[i]}`;
}

function formatCount(n) {
  const num = Number(n);
  return Number.isFinite(num) ? num.toLocaleString('en-IN') : '—';
}

/** 200000 -> "2 days 7 hours" — at most the two largest parts. */
function formatUptime(sec, t) {
  const total = Math.floor(Number(sec));
  if (!Number.isFinite(total) || total < 0) return '—';
  if (total < 60) return t('system.duration.lessThanMinute', 'less than a minute');
  const parts = [
    ['days', Math.floor(total / 86400)],
    ['hours', Math.floor((total % 86400) / 3600)],
    ['minutes', Math.floor((total % 3600) / 60)],
  ];
  const fallback = { days: '{{count}} days', hours: '{{count}} hours', minutes: '{{count}} minutes' };
  const firstNonZero = parts.findIndex(([, v]) => v > 0);
  return parts
    .slice(firstNonZero, firstNonZero + 2)
    .filter(([, v]) => v > 0)
    .map(([unit, count]) => t(`system.duration.${unit}`, { count, defaultValue: fallback[unit] }))
    .join(' ');
}

/**
 * Admin > System (`/admin/system`) — how this deployment is running, `GET /admin/system`
 * (docs/ADMIN_API.md): app version and uptime, configuration (storage, email, sign-in methods),
 * database sizes and per-collection counts, and server memory. Read-only.
 */
export default function AdminSystem() {
  const { t } = useTranslation(['adminOps', 'platform']);
  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ['admin-ops', 'system'],
    queryFn: () => adminOpsApi.system(),
  });

  const app = data?.app || {};
  const config = data?.config || {};
  const db = data?.db || {};
  const memory = data?.memory || {};
  const collections = Object.entries(db.collections || {}).sort(([a], [b]) => a.localeCompare(b));

  const envLabel = (value) =>
    ({
      production: t('system.env.production', 'Live (production)'),
      development: t('system.env.development', 'Development'),
      test: t('system.env.test', 'Test'),
    })[value] || value || '—';

  const driverLabel = (value) =>
    ['gridfs', 's3', 'local'].includes(value)
      ? t(`platform:limits.drivers.${value}`, { gridfs: 'MongoDB (default)', s3: 'S3', local: 'Local disk (dev only)' }[value])
      : value || '—';

  const signInLabel = (value) =>
    ['google', 'password', 'both'].includes(value)
      ? t(`platform:signIn.options.${value}`, { google: 'Google only', password: 'Password only', both: 'Both' }[value])
      : value || '—';

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-neutral-500 dark:text-neutral-400">{t('system.subtitle', 'How this app is running right now')}</p>
        <Button
          variant="secondary"
          leftIcon={<RefreshCw className="h-4 w-4" />}
          onClick={() => refetch()}
          loading={isFetching && !isLoading}
        >
          {t('system.refresh', 'Refresh')}
        </Button>
      </div>

      {/* The four numbers people check first. */}
      {!isError && (
        <section className={`grid grid-cols-1 sm:grid-cols-2 ${GRID_GAP}`}>
          <StatCard
            loading={isLoading}
            icon={Clock}
            tone="blue"
            value={formatUptime(app.uptimeSec, t)}
            label={t('system.app.uptime', 'Running for')}
            sub={{
              strong: app.commit ? String(app.commit).slice(0, 7) : t('system.notAvailable', 'Not available'),
              muted: t('system.app.version', 'Version'),
            }}
          />
          <StatCard
            loading={isLoading}
            icon={Database}
            tone="orange"
            value={formatBytes(db.storageSizeBytes)}
            label={t('system.db.storage', 'Space used on disk')}
            sub={{ strong: formatBytes(db.dataSizeBytes), muted: t('system.db.data', 'Saved data') }}
          />
          <StatCard
            loading={isLoading}
            icon={MemoryStick}
            tone="violet"
            value={formatBytes(memory.rssBytes)}
            label={t('system.memory.rss', 'Total in use')}
            sub={{ strong: formatBytes(memory.heapUsedBytes), muted: t('system.memory.heap', 'Used by the app') }}
          />
          <StatCard
            loading={isLoading}
            icon={Mail}
            tone={config.emailEnabled ? 'green' : 'neutral'}
            value={config.emailEnabled ? t('system.on', 'On') : t('system.off', 'Off')}
            label={t('system.config.email', 'Sending email')}
            sub={{ strong: config.smtpHost || t('system.notSet', 'Not set'), muted: t('system.config.smtpHost', 'Mail server') }}
          />
        </section>
      )}

      {isLoading ? (
        <LoadingState />
      ) : isError ? (
        <ErrorState>{t('system.loadError', 'Could not load system details.')}</ErrorState>
      ) : (
        <div className={`grid grid-cols-1 lg:grid-cols-2 ${GRID_GAP}`}>
          <InfoCard title={t('system.app.title', 'App')}>
            <InfoRow label={t('system.app.version', 'Version')}>
              {app.commit ? (
                <code className="font-mono text-sm" title={app.commit}>
                  {String(app.commit).slice(0, 7)}
                </code>
              ) : (
                t('system.notAvailable', 'Not available')
              )}
            </InfoRow>
            <InfoRow label={t('system.app.uptime', 'Running for')}>{formatUptime(app.uptimeSec, t)}</InfoRow>
            <InfoRow label={t('system.app.node', 'Node.js version')}>{app.nodeVersion || '—'}</InfoRow>
            <InfoRow label={t('system.app.environment', 'Environment')}>{envLabel(app.nodeEnv)}</InfoRow>
          </InfoCard>

          <InfoCard title={t('system.config.title', 'Configuration')}>
            <InfoRow label={t('system.config.storage', 'File storage')}>{driverLabel(config.storageDriver)}</InfoRow>
            <InfoRow label={t('system.config.email', 'Sending email')}>
              {config.emailEnabled ? (
                <Badge tone="green">{t('system.on', 'On')}</Badge>
              ) : (
                <Badge tone="yellow">{t('system.off', 'Off')}</Badge>
              )}
            </InfoRow>
            <InfoRow label={t('system.config.smtpHost', 'Mail server')}>
              <span className="break-all">{config.smtpHost || t('system.notSet', 'Not set')}</span>
            </InfoRow>
            <InfoRow label={t('system.config.signIn', 'Sign-in methods')}>{signInLabel(config.allowedLoginMethods)}</InfoRow>
          </InfoCard>

          <InfoCard title={t('system.db.title', 'Database')}>
            <InfoRow label={t('system.db.data', 'Saved data')}>{formatBytes(db.dataSizeBytes)}</InfoRow>
            <InfoRow label={t('system.db.storage', 'Space used on disk')}>{formatBytes(db.storageSizeBytes)}</InfoRow>
            <InfoRow label={t('system.db.indexes', 'Search indexes')}>{formatBytes(db.indexSizeBytes)}</InfoRow>
            <Notice tone="warning" className="mt-3">
              {t(
                'system.db.freePlanNote',
                'The free database plan only has a limited amount of space. Keep an eye on "Space used on disk" and clear old items from the bin when it grows.',
              )}
              {config.storageDriver === 'gridfs' &&
                ` ${t('system.db.filesInDbNote', 'Uploaded files are saved in the database too, so they count towards this space.')}`}
            </Notice>
          </InfoCard>

          <InfoCard title={t('system.memory.title', 'Server memory')}>
            <InfoRow label={t('system.memory.rss', 'Total in use')}>{formatBytes(memory.rssBytes)}</InfoRow>
            <InfoRow label={t('system.memory.heap', 'Used by the app')}>{formatBytes(memory.heapUsedBytes)}</InfoRow>
          </InfoCard>

          <InfoCard title={t('system.collections.title', 'Records in each collection')} className="lg:col-span-2">
            {collections.length === 0 ? (
              <p className="text-sm text-neutral-500 dark:text-neutral-400">{t('system.collections.empty', 'No collections found.')}</p>
            ) : (
              <dl className="grid grid-cols-1 gap-x-8 sm:grid-cols-2">
                {collections.map(([name, count]) => (
                  <div
                    key={name}
                    className="flex min-h-11 items-center justify-between gap-3 border-b border-neutral-100 dark:border-neutral-700"
                  >
                    <dt className="min-w-0 break-all font-mono text-sm text-neutral-600 dark:text-neutral-300">{name}</dt>
                    <dd className="text-sm font-medium tabular-nums text-neutral-900 dark:text-neutral-100">{formatCount(count)}</dd>
                  </div>
                ))}
              </dl>
            )}
          </InfoCard>
        </div>
      )}
    </div>
  );
}

function InfoCard({ title, className = '', children }) {
  return (
    <Section title={title} className={className}>
      {children}
    </Section>
  );
}

function InfoRow({ label, children }) {
  return (
    <div className="flex min-h-11 items-center justify-between gap-4 border-b border-neutral-100 last:border-b-0 dark:border-neutral-700">
      <span className="text-sm text-neutral-600 dark:text-neutral-400">{label}</span>
      <span className="min-w-0 text-right text-sm font-medium text-neutral-900 dark:text-neutral-100">{children}</span>
    </div>
  );
}
