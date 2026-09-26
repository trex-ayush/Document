import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Clock, Cpu, Database, GitCommitHorizontal, HardDrive, Mail, MemoryStick, RefreshCw, Send } from 'lucide-react';
import Button from '@/components/ui/Button.jsx';
import Badge from '@/components/ui/Badge.jsx';
import StatCard from '@/components/ui/StatCard.jsx';
import SummaryPanel from '@/features/dashboard/SummaryPanel.jsx';
import { ErrorState, LoadingState, Notice } from '@/components/ui/PageState.jsx';
import { GRID_GAP } from '@/components/ui/tokens.js';
import { Section } from './adminShared.jsx';
import { adminOpsApi } from '@/services/adminOpsApi.js';
import Tooltip from '@/components/ui/Tooltip.jsx';

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
  const version = app.commit ? String(app.commit).slice(0, 7) : t('system.notAvailable', 'Not available');
  const emailOn = config.emailEnabled ? t('system.on', 'On') : t('system.off', 'Off');

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

  // What each number or setting means, in a few plain words (tooltips).
  const tips = {
    uptime: t('tip.sys.uptime', 'Time since the server last started'),
    version: t('tip.sys.version', 'Which copy of the app is running'),
    memory: t('tip.sys.memory', 'Memory the server is using'),
    rss: t('tip.sys.rss', 'All the memory in use'),
    heap: t('tip.sys.heap', 'Memory the app itself uses'),
    disk: t('tip.sys.disk', 'Space the data takes on disk'),
    data: t('tip.sys.data', 'Size of all saved data'),
    indexes: t('tip.sys.indexes', 'Extra space that makes search fast'),
    email: t('tip.sys.email', 'Can the app send emails'),
    smtp: t('tip.sys.smtp', 'The server that sends the emails'),
    node: t('tip.sys.node', 'Node.js version on the server'),
    env: t('tip.sys.env', 'Real app or a test copy'),
    fileStorage: t('tip.sys.fileStorage', 'Where uploaded files are kept'),
    signIn: t('tip.sys.signIn', 'How people can sign in'),
  };

  const signInLabel = (value) =>
    ['google', 'password', 'both'].includes(value)
      ? t(`platform:signIn.options.${value}`, { google: 'Google only', password: 'Password only', both: 'Both' }[value])
      : value || '—';

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-neutral-500 dark:text-neutral-400">{t('system.subtitle', 'How this app is running right now')}</p>
        <Tooltip content={t('tip.refresh', 'Check again now')}>
          <Button
            variant="secondary"
            leftIcon={<RefreshCw className="h-4 w-4" />}
            onClick={() => refetch()}
            loading={isFetching && !isLoading}
          >
            {t('system.refresh', 'Refresh')}
          </Button>
        </Tooltip>
      </div>

      {/* The numbers people check first: one summary card below lg, three cards from lg. */}
      {!isError && (
        <section>
          <SummaryPanel
            stacked
            className="lg:hidden"
            loading={isLoading}
            sections={[
              {
                key: 'server',
                title: t('system.app.uptime', 'Running for'),
                total: formatUptime(app.uptimeSec, t),
                totalTip: tips.uptime,
                tone: 'sky',
                rows: [
                  { key: 'version', icon: GitCommitHorizontal, label: t('system.app.version', 'Version'), value: version, tip: tips.version },
                  { key: 'rss', icon: MemoryStick, label: t('system.memory.rss', 'Total in use'), value: formatBytes(memory.rssBytes), tip: tips.rss },
                  { key: 'heap', icon: Cpu, label: t('system.memory.heap', 'Used by the app'), value: formatBytes(memory.heapUsedBytes), tip: tips.heap },
                ],
              },
              {
                key: 'storage',
                title: t('system.db.storage', 'Space used on disk'),
                total: formatBytes(db.storageSizeBytes),
                totalTip: tips.disk,
                tone: 'green',
                rows: [
                  { key: 'data', icon: HardDrive, label: t('system.db.data', 'Saved data'), value: formatBytes(db.dataSizeBytes), tip: tips.data },
                  { key: 'email', icon: Mail, label: t('system.config.email', 'Sending email'), value: emailOn, tip: tips.email },
                  { key: 'smtp', icon: Send, label: t('system.config.smtpHost', 'Mail server'), value: config.smtpHost || t('system.notSet', 'Not set'), tip: tips.smtp },
                ],
              },
            ]}
          />
          <div className={`hidden lg:grid lg:grid-cols-3 ${GRID_GAP}`}>
            <StatCard
              loading={isLoading}
              icon={Clock}
              tone="blue"
              value={formatUptime(app.uptimeSec, t)}
              label={t('system.app.uptime', 'Running for')}
              sub={{ strong: version, muted: t('system.app.version', 'Version') }}
              tip={tips.uptime}
            />
            <StatCard
              loading={isLoading}
              icon={MemoryStick}
              tone="violet"
              value={formatBytes(memory.rssBytes)}
              label={t('system.memory.rss', 'Total in use')}
              sub={{ strong: formatBytes(memory.heapUsedBytes), muted: t('system.memory.heap', 'Used by the app') }}
              tip={tips.memory}
            />
            <StatCard
              loading={isLoading}
              icon={Database}
              tone={config.emailEnabled ? 'green' : 'orange'}
              value={formatBytes(db.storageSizeBytes)}
              label={t('system.db.storage', 'Space used on disk')}
              sub={{ strong: emailOn, muted: t('system.config.email', 'Sending email') }}
              tip={tips.disk}
            />
          </div>
        </section>
      )}

      {isLoading ? (
        <LoadingState />
      ) : isError ? (
        <ErrorState>{t('system.loadError', 'Could not load system details.')}</ErrorState>
      ) : (
        <div className={`grid grid-cols-1 lg:grid-cols-2 ${GRID_GAP}`}>
          <InfoCard title={t('system.app.title', 'App')}>
            <InfoRow label={t('system.app.version', 'Version')} tip={tips.version}>
              {app.commit ? (
                <Tooltip content={String(app.commit)}>
                  <code className="font-mono text-sm">{String(app.commit).slice(0, 7)}</code>
                </Tooltip>
              ) : (
                t('system.notAvailable', 'Not available')
              )}
            </InfoRow>
            <InfoRow label={t('system.app.uptime', 'Running for')} tip={tips.uptime}>{formatUptime(app.uptimeSec, t)}</InfoRow>
            <InfoRow label={t('system.app.node', 'Node.js version')} tip={tips.node}>{app.nodeVersion || '—'}</InfoRow>
            <InfoRow label={t('system.app.environment', 'Environment')} tip={tips.env}>{envLabel(app.nodeEnv)}</InfoRow>
          </InfoCard>

          <InfoCard title={t('system.config.title', 'Configuration')}>
            <InfoRow label={t('system.config.storage', 'File storage')} tip={tips.fileStorage}>{driverLabel(config.storageDriver)}</InfoRow>
            <InfoRow label={t('system.config.email', 'Sending email')} tip={tips.email}>
              {config.emailEnabled ? (
                <Badge tone="green">{t('system.on', 'On')}</Badge>
              ) : (
                <Badge tone="yellow">{t('system.off', 'Off')}</Badge>
              )}
            </InfoRow>
            <InfoRow label={t('system.config.smtpHost', 'Mail server')} tip={tips.smtp}>
              <span className="break-all">{config.smtpHost || t('system.notSet', 'Not set')}</span>
            </InfoRow>
            <InfoRow label={t('system.config.signIn', 'Sign-in methods')} tip={tips.signIn}>{signInLabel(config.allowedLoginMethods)}</InfoRow>
          </InfoCard>

          <InfoCard title={t('system.db.title', 'Database')}>
            <InfoRow label={t('system.db.data', 'Saved data')} tip={tips.data}>{formatBytes(db.dataSizeBytes)}</InfoRow>
            <InfoRow label={t('system.db.storage', 'Space used on disk')} tip={tips.disk}>{formatBytes(db.storageSizeBytes)}</InfoRow>
            <InfoRow label={t('system.db.indexes', 'Search indexes')} tip={tips.indexes}>{formatBytes(db.indexSizeBytes)}</InfoRow>
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
            <InfoRow label={t('system.memory.rss', 'Total in use')} tip={tips.rss}>{formatBytes(memory.rssBytes)}</InfoRow>
            <InfoRow label={t('system.memory.heap', 'Used by the app')} tip={tips.heap}>{formatBytes(memory.heapUsedBytes)}</InfoRow>
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

/** One label · value line; `tip` says in a few words what the value means. */
function InfoRow({ label, tip, children }) {
  return (
    <div className="flex min-h-11 items-center justify-between gap-4 border-b border-neutral-100 last:border-b-0 dark:border-neutral-700">
      <Tooltip content={tip} position="right">
        <span className="text-sm text-neutral-600 dark:text-neutral-400">{label}</span>
      </Tooltip>
      <span className="min-w-0 text-right text-sm font-medium text-neutral-900 dark:text-neutral-100">{children}</span>
    </div>
  );
}
