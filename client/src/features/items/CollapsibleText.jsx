import { useLayoutEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

/**
 * Long text (notes, text read from a file) cut to 3 lines, with "Show all (N)" — N being its
 * number of lines — and "Show less". Short text shows as it is, with no button.
 *
 * Props: text, className?, actions? (buttons shown at the end of the "Show all" row)
 */
export default function CollapsibleText({ text, className = '', actions = null }) {
  const { t } = useTranslation('items');
  const ref = useRef(null);
  const [open, setOpen] = useState(false);
  const [long, setLong] = useState(false);
  const lineCount = String(text || '').split('\n').filter((l) => l.trim()).length;

  useLayoutEffect(() => {
    const el = ref.current;
    if (el && !open) setLong(el.scrollHeight > el.clientHeight + 1);
  }, [text, open]);

  return (
    <div className={className}>
      <p ref={ref} className={`whitespace-pre-wrap break-words ${open ? '' : 'line-clamp-3'}`}>{text}</p>
      {(long || open || actions) && (
        <div className="mt-1 flex flex-wrap items-center gap-x-1">
          {(long || open) && (
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              aria-expanded={open}
              className="inline-flex min-h-8 items-center whitespace-nowrap text-sm font-medium text-primary-600 hover:underline dark:text-primary-400"
            >
              {open ? t('detail.showLess', 'Show less') : t('detail.showAllCount', 'Show all ({{count}})', { count: Math.max(lineCount, 1) })}
            </button>
          )}
          {actions && <div className="-mr-2 ml-auto flex items-center">{actions}</div>}
        </div>
      )}
    </div>
  );
}
