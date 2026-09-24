import { useEffect, useState } from 'react';

/**
 * Returns `value`, updated only after `delayMs` of no further changes.
 * Used by Search / the command palette to avoid firing a network request on
 * every keystroke.
 *
 * @param {*} value
 * @param {number} [delayMs=300]
 */
export function useDebouncedValue(value, delayMs = 300) {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(t);
  }, [value, delayMs]);

  return debounced;
}

export default useDebouncedValue;
