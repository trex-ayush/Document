import { forwardRef } from 'react';
import { FIELD_BORDER, FIELD_BORDER_ERROR, FIELD_CONTROL, FIELD_ERROR, FIELD_HINT, FIELD_LABEL } from './tokens.js';

/**
 * Input — base text input: `<label>` + `<input>` + optional `error`/`help`
 * text. Forwards `ref` (Rule 14) so react-hook-form's `register` and
 * imperative `.focus()` both work.
 *
 * Ported from apps/template/src/components/ui/Input.jsx; the box, label and hint/error use the
 * shared field tokens so every text box, select and textarea looks the same.
 *
 * Props: label?, error?, help?, leftIcon?, rightIcon? (decorative), trailing? (an interactive
 * control inside the right end, e.g. PasswordInput's eye button or a copy button), className? (on the
 * `<input>`), id?, ...rest (spreads onto `<input>` — name, type, onChange,
 * {...register(...)}, etc.)
 *
 * @example
 * <Input label="Email" type="email" error={errors.email?.message} {...register('email')} />
 */
const Input = forwardRef(function Input(
  { label, error, help, leftIcon, rightIcon, trailing, className = '', id, ...rest },
  ref
) {
  const inputId = id || rest.name || `input-${Math.random().toString(36).slice(2, 7)}`;
  return (
    <div className="w-full">
      {label && (
        <label htmlFor={inputId} className={FIELD_LABEL}>
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
          className={`${FIELD_CONTROL} ${error ? FIELD_BORDER_ERROR : FIELD_BORDER} ${leftIcon ? 'pl-9' : ''} ${rightIcon ? 'pr-9' : ''} ${trailing ? 'pr-12' : ''} ${className}`}
          {...rest}
        />
        {trailing && <span className="absolute inset-y-0 right-0 flex items-center">{trailing}</span>}
        {rightIcon && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 dark:text-neutral-500">
            {rightIcon}
          </span>
        )}
      </div>
      {error ? (
        <p className={FIELD_ERROR}>{error}</p>
      ) : help ? (
        <p className={FIELD_HINT}>{help}</p>
      ) : null}
    </div>
  );
});

export default Input;
