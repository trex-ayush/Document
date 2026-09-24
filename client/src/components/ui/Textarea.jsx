import { forwardRef, useId } from 'react';

/**
 * Textarea — multi-line text input with optional label, hint, and error
 * state. Spreads native attributes so it composes with react-hook-form via
 * `{...register}`.
 *
 * Ported from apps/component/src/components/ui/Textarea.tsx (types stripped).
 *
 * Props: label?, error? (boolean or string — string also renders the
 * message), hint?, fullWidth? (default true), rows? (default 4), id?,
 * ...rest (spreads onto `<textarea>`)
 *
 * @example
 * <Textarea label="Notes" rows={4} error={errors.notes?.message} {...register('notes')} />
 */
export const Textarea = forwardRef(function Textarea(
  { error, hint, label, fullWidth = true, className = '', rows = 4, id, ...rest },
  ref,
) {
  const autoId = useId();
  const textareaId = id ?? autoId;
  const errorMessage = typeof error === 'string' ? error : undefined;
  const hasError = Boolean(error);

  const field = (
    <textarea
      ref={ref}
      id={textareaId}
      rows={rows}
      className={`w-full px-3 py-2 text-sm rounded-lg bg-white dark:bg-neutral-800 transition-colors border text-neutral-900 dark:text-neutral-100 placeholder-neutral-400 dark:placeholder-neutral-500 disabled:opacity-60 disabled:cursor-not-allowed resize-y ${
        hasError ? 'border-red-400 dark:border-red-600 focus:border-red-500' : 'border-neutral-300 dark:border-neutral-600'
      } ${className}`}
      {...rest}
    />
  );

  if (!label && !errorMessage && !hint) {
    return fullWidth ? field : <div className="inline-block">{field}</div>;
  }

  return (
    <div className={fullWidth ? 'w-full' : undefined}>
      {label && (
        <label htmlFor={textareaId} className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">
          {label}
        </label>
      )}
      {field}
      {errorMessage ? (
        <p className="mt-1 text-xs text-red-600 dark:text-red-400">{errorMessage}</p>
      ) : hint ? (
        <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">{hint}</p>
      ) : null}
    </div>
  );
});

export default Textarea;
