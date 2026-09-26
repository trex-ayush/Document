import { useEffect, useRef } from 'react';

/**
 * useInfiniteScroll — IntersectionObserver-based "load more" trigger for a
 * cursor-paginated list (e.g. the Activity feed, `GET /activity`'s
 * `{items, nextCursor}` shape). Attach the returned ref to a sentinel
 * element placed after the last row; `onIntersect` fires once each time it
 * scrolls into view (guard against duplicate calls with your own
 * `hasNextPage`/`isFetchingNextPage` check, same as this hook's own caller
 * does in `pages/Activity.jsx`).
 *
 * @param {() => void} onIntersect
 * @param {{ enabled?: boolean, rootMargin?: string }} [options]
 * @returns {import('react').RefObject}
 *
 * @example
 * const sentinelRef = useInfiniteScroll(() => {
 *   if (hasNextPage && !isFetchingNextPage) fetchNextPage();
 * }, { enabled: hasNextPage });
 * // ...
 * <div ref={sentinelRef} />
 */
export function useInfiniteScroll(onIntersect, { enabled = true, rootMargin = '200px' } = {}) {
  const sentinelRef = useRef(null);
  const callbackRef = useRef(onIntersect);
  callbackRef.current = onIntersect;

  useEffect(() => {
    if (!enabled) return undefined;
    const node = sentinelRef.current;
    if (!node || typeof IntersectionObserver === 'undefined') return undefined;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) callbackRef.current?.();
      },
      { rootMargin },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [enabled, rootMargin]);

  return sentinelRef;
}
