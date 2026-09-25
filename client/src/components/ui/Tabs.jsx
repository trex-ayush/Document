import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { SEGMENT_TRACK, segmentItem } from './tokens.js';

/**
 * Tabs — tabbed panel. Controlled (pass `value` + `onValueChange`) or
 * uncontrolled (pass `defaultValue`). Composes with `TabsList`,
 * `TabsTrigger`, `TabsContent`.
 *
 * Ported verbatim from apps/component/src/components/ui/Tabs.tsx (types stripped).
 *
 * @example
 * <Tabs defaultValue="details">
 *   <TabsList>
 *     <TabsTrigger value="details">Details</TabsTrigger>
 *     <TabsTrigger value="activity">Activity</TabsTrigger>
 *   </TabsList>
 *   <TabsContent value="details">...</TabsContent>
 *   <TabsContent value="activity">...</TabsContent>
 * </Tabs>
 */
const TabsContext = createContext(null);

function useTabs() {
  const ctx = useContext(TabsContext);
  if (!ctx) throw new Error('Tabs subcomponents must be used inside <Tabs>');
  return ctx;
}

export function Tabs({ defaultValue, value: controlled, onValueChange, children, className = '' }) {
  const [internal, setInternal] = useState(defaultValue);
  const value = controlled ?? internal;
  const setValue = (next) => {
    if (controlled === undefined) setInternal(next);
    onValueChange?.(next);
  };

  return (
    <TabsContext.Provider value={{ value, setValue }}>
      <div className={className}>{children}</div>
    </TabsContext.Provider>
  );
}

export function TabsList({ children, className = '' }) {
  return (
    <div role="tablist" className={`inline-flex items-center gap-1 overflow-x-auto scrollbar-hide ${SEGMENT_TRACK} ${className}`}>
      {children}
    </div>
  );
}

export function TabsTrigger({ value, children, disabled }) {
  const ctx = useTabs();
  const active = ctx.value === value;
  const ref = useRef(null);

  // On phones the tab strip scrolls horizontally (see TabsList); when the
  // active tab becomes selected — including on initial mount, e.g. an
  // admin-only tab set as `defaultValue` past the visible edge — make sure
  // it's actually visible instead of leaving it scrolled off-screen.
  useEffect(() => {
    if (active) {
      ref.current?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }
  }, [active]);

  return (
    <button
      ref={ref}
      type="button"
      role="tab"
      aria-selected={active}
      disabled={disabled}
      onClick={() => ctx.setValue(value)}
      className={`min-h-10 whitespace-nowrap px-3 text-sm disabled:cursor-not-allowed disabled:opacity-50 ${segmentItem(active)}`}
    >
      {children}
    </button>
  );
}

export function TabsContent({ value, children, className = '' }) {
  const ctx = useTabs();
  if (ctx.value !== value) return null;
  return (
    <div role="tabpanel" className={`mt-4 sm:mt-6 ${className}`}>
      {children}
    </div>
  );
}

export default Tabs;
