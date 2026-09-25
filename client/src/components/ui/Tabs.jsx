import { createContext, useContext, useEffect, useRef, useState } from 'react';

/**
 * Tabs — tabbed panel. Controlled (pass `value` + `onValueChange`) or uncontrolled (pass
 * `defaultValue`). Composes with `TabsList`, `TabsTrigger`, `TabsContent`.
 *
 * Look (docs/UI_KIT.md "Design standard" → Tabs): a full-width row with a hairline along the
 * bottom; each tab is an optional small outline icon + label. Inactive tabs are muted and darken
 * on hover; the active tab is near-black, medium weight, with a 2px dark underline sitting on the
 * hairline. On a narrow screen the row scrolls sideways with no visible scrollbar (a soft edge
 * fade shows there's more), and the active tab is scrolled into view.
 *
 * Originally ported from apps/component/src/components/ui/Tabs.tsx; restyled from a segmented
 * pill to the underline design. Segmented controls (theme, language, grid/list) are separate.
 *
 * TabsTrigger props: value, children, icon? (lucide component), disabled?
 *
 * @example
 * <Tabs defaultValue="details">
 *   <TabsList>
 *     <TabsTrigger value="details" icon={FileText}>Details</TabsTrigger>
 *     <TabsTrigger value="activity" icon={History}>Activity</TabsTrigger>
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

/** Hairline under the whole row (an inset shadow, so the scroll box doesn't clip the underline). */
const ROW_LINE = 'shadow-[inset_0_-1px_0_#E7E5E4] dark:shadow-[inset_0_-1px_0_#44403C]';

export function TabsList({ children, className = '' }) {
  const scrollRef = useRef(null);
  const [edges, setEdges] = useState({ left: false, right: false });

  const updateEdges = () => {
    const el = scrollRef.current;
    if (!el) return;
    const left = el.scrollLeft > 4;
    const right = el.scrollLeft + el.clientWidth < el.scrollWidth - 4;
    setEdges((prev) => (prev.left === left && prev.right === right ? prev : { left, right }));
  };

  useEffect(() => {
    updateEdges();
  });

  useEffect(() => {
    window.addEventListener('resize', updateEdges);
    return () => window.removeEventListener('resize', updateEdges);
  }, []);

  return (
    <div className={`relative ${className}`}>
      <div
        ref={scrollRef}
        role="tablist"
        onScroll={updateEdges}
        className={`flex w-full items-stretch gap-1 overflow-x-auto scrollbar-hide sm:gap-2 ${ROW_LINE}`}
      >
        {children}
      </div>
      {edges.left && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 left-0 w-8 bg-linear-to-r from-neutral-50 to-transparent dark:from-neutral-950"
        />
      )}
      {edges.right && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-linear-to-l from-neutral-50 to-transparent dark:from-neutral-950"
        />
      )}
    </div>
  );
}

export function TabsTrigger({ value, children, icon: Icon, disabled }) {
  const ctx = useTabs();
  const active = ctx.value === value;
  const ref = useRef(null);

  // On phones the tab row scrolls sideways; when a tab becomes active — including on first
  // render, e.g. a tab set as `defaultValue` past the visible edge — scroll it into view.
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
      className={`inline-flex min-h-11 flex-shrink-0 items-center gap-2 whitespace-nowrap border-b-2 px-3 text-sm transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary-400 disabled:cursor-not-allowed disabled:opacity-50 lg:min-h-10 ${
        active
          ? 'border-neutral-900 font-medium text-neutral-900 dark:border-neutral-100 dark:text-neutral-100'
          : 'border-transparent text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100'
      }`}
    >
      {Icon && <Icon className="h-4 w-4 flex-shrink-0" strokeWidth={1.75} aria-hidden="true" />}
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
