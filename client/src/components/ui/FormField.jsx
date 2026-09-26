import { FIELD_ERROR, FIELD_HINT, FIELD_LABEL } from './tokens.js';

/**
 * FormField — wraps a form control with a label, optional required asterisk,
 * hint, and error message. Keeps spacing consistent across every form.
 *
 * Ported from apps/component/src/components/ui/FormField.tsx (types
 * stripped). The reference imports a separate `<Label>` primitive; inlined
 * here since it's only ever used by FormField in this codebase — not worth a
 * second file for one `<label>` + optional asterisk.
 *
 * Props: label?, htmlFor?, required?, error?, hint?, children (the control)
 *
 * @example
 * <FormField label="Email" htmlFor="email" required error={errors.email?.message}>
 *   <Input id="email" type="email" {...register('email')} />
 * </FormField>
 */
export function FormField({ label, htmlFor, required, error, hint, children }) {
  return (
    <div className="w-full">
      {label && (
        <label htmlFor={htmlFor} className={FIELD_LABEL}>
          {label}
          {required && <span className="text-red-500 ml-0.5">*</span>}
        </label>
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
