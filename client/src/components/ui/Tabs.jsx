import { createContext, useContext, useState } from 'react';

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
    <div role="tablist" className={`inline-flex items-center gap-1 p-1 rounded-lg bg-neutral-100 dark:bg-neutral-800 overflow-x-auto scrollbar-hide ${className}`}>
      {children}
    </div>
  );
}

export function TabsTrigger({ value, children, disabled }) {
  const ctx = useTabs();
  const active = ctx.value === value;
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      disabled={disabled}
      onClick={() => ctx.setValue(value)}
      className={`px-3 py-1.5 text-sm rounded-md font-medium transition-all whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed ${
        active
          ? 'bg-white dark:bg-neutral-700 text-neutral-900 dark:text-neutral-100 shadow-sm'
          : 'text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200'
      }`}
    >
      {children}
    </button>
  );
}

export function TabsContent({ value, children, className = '' }) {
  const ctx = useTabs();
  if (ctx.value !== value) return null;
  return (
    <div role="tabpanel" className={`mt-4 ${className}`}>
      {children}
    </div>
  );
}

export default Tabs;
