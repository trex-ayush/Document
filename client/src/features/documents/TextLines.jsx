import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import CopyButton from '@/features/items/CopyButton.jsx';
import { isReadableLine } from '@/features/scan/formFill.js';
import { copyValue, parseNoteLines } from './noteLines.js';

/**
 * Text shown line by line, each line with its own copy button right after it (not at the far
 * edge), like the notes on the document page: "Label: value" lines copy just the value, other
 * lines copy the whole line. Blank and junk lines (the scanner's own filter) are left out. Only
 * the first `maxRows` rows show until "Show all (N)".
 *
 * Props: text, maxRows? (default 5), tone? ('light' | 'dark' — the full-screen viewer)
 */
export default function TextLines({ text, maxRows = 5, tone = 'light' }) {
  const { t } = useTranslation(['documents', 'items']);
  const [open, setOpen] = useState(false);
  const lines = parseNoteLines(text).filter((l) => l.type !== 'text' || isReadableLine(l.value.replace(/\s+/g, ' ')));
  const rowCount = lines.filter((l) => l.type !== 'heading').length;
  const collapsible = rowCount > maxRows;
  let shown = lines;
  if (collapsible && !open) {
    let rows = 0;
    const end = lines.findIndex((l) => l.type !== 'heading' && ++rows === maxRows);
    shown = lines.slice(0, end + 1);
  }
  const dark = tone === 'dark';
  const muted = dark ? 'text-white/60' : 'text-neutral-500 dark:text-neutral-400';
  const body = dark ? 'text-white/90' : 'text-neutral-900 dark:text-neutral-100';

  if (!lines.length) return null;
  return (
    <div>
      <ul className={dark ? 'divide-y divide-white/10' : 'divide-y divide-neutral-100 dark:divide-neutral-700'}>
        {shown.map((line, i) =>
          line.type === 'heading' ? (
            <li key={i} className="pb-0.5 pt-2">
              <p className={`text-xs font-semibold ${muted}`}>{line.value}</p>
            </li>
          ) : (
            <li key={i} className="py-0.5">
              {line.type === 'field' && <p className={`pt-1 text-xs font-medium ${muted}`}>{line.label}</p>}
              <div className="flex min-w-0 items-center gap-1">
                <p className={`min-w-0 break-words py-1.5 text-sm [overflow-wrap:anywhere] ${body}`}>{line.value}</p>
                <CopyButton
                  tone={dark ? 'dark' : 'default'}
                  value={copyValue(line.value)}
                  label={line.type === 'field' ? t('detail.copyField', 'Copy {{name}}', { name: line.label }) : t('detail.copyLine', 'Copy this line')}
                />
              </div>
            </li>
          ),
        )}
      </ul>
      {collapsible && (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className={`mt-1 inline-flex min-h-8 items-center whitespace-nowrap text-sm font-medium hover:underline ${dark ? 'text-primary-300' : 'text-primary-600 dark:text-primary-400'}`}
        >
          {open ? t('items:detail.showLess', 'Show less') : t('items:detail.showAllCount', 'Show all ({{count}})', { count: rowCount })}
        </button>
      )}
    </div>
  );
}
