import { forwardRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Eye, EyeOff } from 'lucide-react';
import Input from './Input.jsx';

/**
 * PasswordInput — `Input` for a password with an eye button inside its right end: tap to show
 * or hide what's typed (Eye ↔ EyeOff, "Show password" / "Hide password"). Takes every `Input`
 * prop (label, error, help, register…) and forwards `ref`. `readOnly` works too — the saved
 * password page shows the password as dots with the same eye to reveal it.
 *
 * @example
 * <PasswordInput label="Password" autoComplete="current-password" error={errors.password?.message} {...register('password')} />
 */
const PasswordInput = forwardRef(function PasswordInput({ className = '', ...rest }, ref) {
  const { t } = useTranslation('common');
  const [visible, setVisible] = useState(false);
  const label = visible ? t('actions.hidePassword', 'Hide password') : t('actions.showPassword', 'Show password');
  return (
    <Input
      ref={ref}
      type={visible ? 'text' : 'password'}
      autoCapitalize="none"
      spellCheck={false}
      className={className}
      trailing={
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={label}
          title={label}
          aria-pressed={visible}
          className="flex h-full w-11 items-center justify-center rounded-r-lg text-neutral-500 transition-colors hover:text-neutral-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary-400 dark:text-neutral-400 dark:hover:text-neutral-100"
        >
          {visible ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
        </button>
      }
      {...rest}
    />
  );
});

export default PasswordInput;
