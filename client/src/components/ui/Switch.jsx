import { forwardRef } from 'react';

/**
 * Switch — iOS-style toggle. Renders a real hidden checkbox so it works
 * with react-hook-form's `register` and is keyboard accessible.
 *
 * Ported from apps/component/src/components/ui/Switch.tsx (types stripped),
 * color changed from `primary-500` (already our coral token, kept as-is).
 *
 * Props: label?, description?, size? ('sm' | 'md' default), disabled?, ...rest (spreads onto the checkbox — checked, onChange, name, {...register(...)})
 *
 * @example
 * <Switch label="Require re-auth for secrets" description="Ask for your password again before revealing a saved password." {...register('requireReauthForSecrets')} />
 */
const SIZE = {
  sm: { track: 'h-4 w-8', thumb: 'h-3 w-3 peer-checked:translate-x-4' },
  md: { track: 'h-5 w-10', thumb: 'h-4 w-4 peer-checked:translate-x-5' },
};

export const Switch = forwardRef(function Switch(
  { label, description, size = 'md', className = '', disabled, ...rest },
  ref,
) {
  const sizes = SIZE[size] || SIZE.md;
  return (
    <label
      className={`inline-flex items-start gap-3 cursor-pointer select-none leading-tight ${disabled ? 'opacity-60 cursor-not-allowed' : ''} ${className}`}
    >
      <span className="relative inline-flex items-center mt-0.5 flex-shrink-0">
        <input ref={ref} type="checkbox" disabled={disabled} {...rest} className="peer sr-only" />
        <span
          className={`inline-block rounded-full bg-neutral-300 dark:bg-neutral-600 transition-colors peer-checked:bg-primary-500 peer-focus-visible:ring-2 peer-focus-visible:ring-offset-2 peer-focus-visible:ring-primary-400 ${sizes.track}`}
        />
        <span className={`absolute left-0.5 inline-block rounded-full bg-white shadow-sm transition-transform ${sizes.thumb}`} />
      </span>
      {(label || description) && (
        <span className="flex-1 min-w-0 -mt-0.5">
          {label ? <span className="block text-sm text-neutral-900 dark:text-neutral-100">{label}</span> : null}
          {description ? <span className="block text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">{description}</span> : null}
        </span>
      )}
    </label>
  );
});

export default Switch;
