import { forwardRef, useId } from 'react';
import { FIELD_BORDER, FIELD_BORDER_ERROR, FIELD_CONTROL, FIELD_ERROR, FIELD_HINT, FIELD_LABEL } from './tokens.js';

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
      className={`${FIELD_CONTROL} resize-y ${hasError ? FIELD_BORDER_ERROR : FIELD_BORDER} ${className}`}
      {...rest}
    />
  );

  if (!label && !errorMessage && !hint) {
    return fullWidth ? field : <div className="inline-block">{field}</div>;
  }

  return (
    <div className={fullWidth ? 'w-full' : undefined}>
      {label && (
        <label htmlFor={textareaId} className={FIELD_LABEL}>
          {label}
        </label>
      )}
      {field}
      {errorMessage ? (
        <p className={FIELD_ERROR}>{errorMessage}</p>
      ) : hint ? (
        <p className={FIELD_HINT}>{hint}</p>
      ) : null}
    </div>
  );
});

export default Textarea;
