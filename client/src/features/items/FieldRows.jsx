import { useTranslation } from 'react-i18next';
import Input from '@/components/ui/Input.jsx';
import PasswordInput from '@/components/ui/PasswordInput.jsx';
import Button from '@/components/ui/Button.jsx';
import { Lock, LockOpen, Plus, X } from 'lucide-react';
import { isSensitiveKey } from './sensitiveKey.js';

let rowSeq = 0;
/**
 * An extra-field row. `uid` is only a React key — it is never sent to the server. `secret` is
 * "Keep secret"; `secretSet` marks a row whose secret switch the user chose, so it no longer
 * follows the name. A saved row counts as chosen only when its flag differs from what its name
 * suggests — otherwise renaming it still switches "Keep secret" on or off.
 */
export const newFieldRow = (key = '', value = '', secret) => {
  const auto = isSensitiveKey(key);
  const isSecret = typeof secret === 'boolean' ? secret : auto;
  return { uid: `f${rowSeq++}`, key, value, secret: isSecret, secretSet: isSecret !== auto };
};

// The "Keep secret" switch: quiet when off, tinted when on.
const SECRET_ON = 'bg-primary-50 text-primary-600 hover:bg-primary-100 dark:bg-primary-900/30 dark:text-primary-400 dark:hover:bg-primary-900/50';

/**
 * "+ Add field" rows for a password: each row is a name (e.g. "PIN", "Website"), its value, a
 * "Keep secret" lock switch and a remove button. A secret value is typed in a hidden box (eye to
 * show it). "Keep secret" switches on by itself for names like PIN / password / OTP / CVV until
 * the user flips it for that row. Controlled: `rows` is `[{ uid, key, value, secret, secretSet }]`,
 * `onChange(nextRows)`. `errors` maps a row uid to a message (a value without a name).
 */
export default function FieldRows({ rows, onChange, errors = {}, disabled = false }) {
  const { t } = useTranslation('items');
  const update = (uid, patch) => onChange(rows.map((r) => (r.uid === uid ? { ...r, ...patch } : r)));
  const rename = (row, key) => update(row.uid, row.secretSet ? { key } : { key, secret: isSensitiveKey(key) });
  const secretLabel = t('fieldRows.keepSecret', 'Keep secret');
  const secretHint = t('fieldRows.keepSecretHint', 'Keep secret: hidden on the page and never shown in search');

  return (
    // From lg the rows sit two to a line; each name and its value stay together.
    <div className="grid grid-cols-1 gap-2 lg:grid-cols-2 lg:gap-x-4">
      {rows.map((row) => (
        <div key={row.uid} className="flex items-start gap-2">
          <div className="grid min-w-0 flex-1 grid-cols-1 gap-2 sm:grid-cols-2">
            <Input
              aria-label={t('fieldRows.keyLabel', 'Field name')}
              placeholder={t('fieldRows.keyPlaceholder', 'Name (e.g. PIN)')}
              value={row.key}
              maxLength={100}
              disabled={disabled}
              error={errors[row.uid]}
              onChange={(e) => rename(row, e.target.value)}
            />
            {row.secret ? (
              <PasswordInput
                aria-label={t('fieldRows.valueLabel', 'Value')}
                placeholder={t('fieldRows.valuePlaceholder', 'Value')}
                value={row.value}
                maxLength={2000}
                disabled={disabled}
                autoComplete="off"
                className="font-mono"
                onChange={(e) => update(row.uid, { value: e.target.value })}
              />
            ) : (
              <Input
                aria-label={t('fieldRows.valueLabel', 'Value')}
                placeholder={t('fieldRows.valuePlaceholder', 'Value')}
                value={row.value}
                maxLength={2000}
                disabled={disabled}
                autoComplete="off"
                onChange={(e) => update(row.uid, { value: e.target.value })}
              />
            )}
          </div>
          {/* The two row buttons sit together, without a gap, to leave the boxes more room. */}
          <div className="flex flex-shrink-0">
            <Button
              variant={row.secret ? 'bare' : 'ghost'}
              size="icon"
              onClick={() => update(row.uid, { secret: !row.secret, secretSet: true })}
              disabled={disabled}
              aria-pressed={row.secret}
              aria-label={secretLabel}
              title={secretHint}
              className={row.secret ? SECRET_ON : ''}
            >
              {row.secret ? <Lock className="h-4 w-4" aria-hidden="true" /> : <LockOpen className="h-4 w-4" aria-hidden="true" />}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => onChange(rows.filter((r) => r.uid !== row.uid))}
              disabled={disabled}
              aria-label={t('fieldRows.removeField', 'Remove field')}
              title={t('fieldRows.removeField', 'Remove field')}
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </Button>
          </div>
        </div>
      ))}
      <div className="lg:col-span-2">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          leftIcon={<Plus className="h-4 w-4" />}
          onClick={() => onChange([...rows, newFieldRow()])}
          disabled={disabled}
        >
          {t('fieldRows.addField', 'Add field')}
        </Button>
      </div>
    </div>
  );
}
