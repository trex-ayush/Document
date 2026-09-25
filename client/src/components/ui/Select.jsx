import { forwardRef } from 'react';
import { FIELD_BORDER, FIELD_CONTROL } from './tokens.js';

/**
 * Select — a native `<select>` with the same box as `Input` (height, border, radius, colours).
 * Forwards `ref` so react-hook-form's `register` works. Wrap it in `FormField` for a label.
 *
 * @example
 * <FormField label="Access level" htmlFor="access"><Select id="access" {...register('access')}>…</Select></FormField>
 */
const Select = forwardRef(function Select({ className = '', children, ...rest }, ref) {
  return (
    <select ref={ref} className={`${FIELD_CONTROL} ${FIELD_BORDER} ${className}`} {...rest}>
      {children}
    </select>
  );
});

export default Select;
