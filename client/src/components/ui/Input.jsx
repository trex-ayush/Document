import { forwardRef } from 'react';

/**
 * Input — base text input: `<label>` + `<input>` + optional `error`/`help`
 * text. Forwards `ref` (Rule 14) so react-hook-form's `register` and
 * imperative `.focus()` both work.
 *
 * Ported verbatim from apps/template/src/components/ui/Input.jsx.
 *
 * Props: label?, error?, help?, leftIcon?, rightIcon?, className? (on the
 * `<input>`), id?, ...rest (spreads onto `<input>` — name, type, onChange,
 * {...register(...)}, etc.)
 *
 * @example
 * <Input label="Email" type="email" error={errors.email?.message} {...register('email')} />
 */
const Input = forwardRef(function Input(
  { label, error, help, leftIcon, rightIcon, className = '', id, ...rest },
  ref
) {
  const inputId = id || rest.name || `input-${Math.random().toString(36).slice(2, 7)}`;
  return (
    <div className="w-full">
      {label && (
        <label
          htmlFor={inputId}
          className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1.5"
        >
          {label}
        </label>
      )}
      <div className="relative">
        {leftIcon && (
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400 dark:text-neutral-500">
            {leftIcon}
          </span>
        )}
        <input
          id={inputId}
          ref={ref}
          className={`w-full ${leftIcon ? 'pl-9' : 'pl-4'} ${rightIcon ? 'pr-9' : 'pr-4'} py-2.5 border border-neutral-300 dark:border-neutral-600 rounded-xl text-sm text-neutral-900 dark:text-white bg-white dark:bg-neutral-700 placeholder-neutral-400 dark:placeholder-neutral-500 transition-all duration-200 ${error ? '!border-red-400 focus:ring-red-200' : ''} ${className}`}
          {...rest}
        />
        {rightIcon && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 dark:text-neutral-500">
            {rightIcon}
          </span>
        )}
      </div>
      {error ? (
        <p className="mt-1 text-xs text-red-600 dark:text-red-400">{error}</p>
      ) : help ? (
        <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">{help}</p>
      ) : null}
    </div>
  );
});

export default Input;
