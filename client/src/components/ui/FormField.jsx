import { Info } from 'lucide-react';
import { FIELD_ERROR, FIELD_HINT, FIELD_LABEL } from './tokens.js';
import Tooltip from './Tooltip.jsx';

/**
 * InfoTip — a small ⓘ next to a label that shows a short hint on hover or keyboard focus.
 * It is focusable (Tab reaches it) and carries the hint as its accessible name. Use it only where
 * the label alone may confuse a first-time user ("Keep secret", "Default share link duration").
 *
 * @example
 * <InfoTip text={t('common:tip.saveInFolderInfo', 'The folder where this will be kept')} />
 */
export function InfoTip({ text, className = '' }) {
  if (!text) return null;
  return (
    <Tooltip content={text} className={`inline-flex items-center ${className}`}>
      <span
        tabIndex={0}
        role="img"
        aria-label={text}
        className="inline-flex rounded-full text-neutral-400 transition-colors hover:text-neutral-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-400 dark:text-neutral-500 dark:hover:text-neutral-300"
      >
        <Info className="h-3.5 w-3.5" aria-hidden="true" />
      </span>
    </Tooltip>
  );
}

/**
 * FormField — wraps a form control with a label, optional required asterisk,
 * hint, and error message. Keeps spacing consistent across every form.
 *
 * Ported from apps/component/src/components/ui/FormField.tsx (types
 * stripped). The reference imports a separate `<Label>` primitive; inlined
 * here since it's only ever used by FormField in this codebase — not worth a
 * second file for one `<label>` + optional asterisk.
 *
 * Props: label?, htmlFor?, required?, error?, hint?, info? (a short tooltip on an ⓘ beside the
 * label — kept outside the <label> so it isn't read as part of the field's name), children
 *
 * @example
 * <FormField label="Email" htmlFor="email" required error={errors.email?.message}>
 *   <Input id="email" type="email" {...register('email')} />
 * </FormField>
 */
export function FormField({ label, htmlFor, required, error, hint, info, children }) {
  const labelEl = label && (
    <label htmlFor={htmlFor} className={info ? FIELD_LABEL.replace('mb-1.5 ', '') : FIELD_LABEL}>
      {label}
      {required && <span className="text-red-500 ml-0.5">*</span>}
    </label>
  );
  return (
    <div className="w-full">
      {labelEl && info ? (
        <div className="mb-1.5 flex items-center gap-1.5">
          {labelEl}
          <InfoTip text={info} />
        </div>
      ) : (
        labelEl
      )}
      {children}
      {error ? (
        <p className={FIELD_ERROR} role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className={FIELD_HINT}>{hint}</p>
      ) : null}
    </div>
  );
}
