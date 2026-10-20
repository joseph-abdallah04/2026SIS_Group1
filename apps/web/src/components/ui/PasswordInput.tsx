import { useId, useState, type InputHTMLAttributes, type ReactNode } from 'react';
import { Eye, EyeOff } from 'lucide-react';

interface PasswordInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'id'> {
  label: ReactNode;
  /** The label and field together, as the form's other labelled fields are laid out. */
  className?: string;
  inputClassName?: string;
}

/**
 * A password field with an eye to show what has been typed, and hide it again.
 *
 * The eye sits outside the label, so the field is still named only by it
 * ("Password"), and the eye is a button of its own ("Show password").
 * Shown or not, it is still the password field to the browser's password
 * manager, which reads its `autocomplete`.
 */
export function PasswordInput({
  label,
  className = '',
  inputClassName = '',
  ...props
}: PasswordInputProps) {
  const id = useId();
  const [shown, setShown] = useState(false);
  const Icon = shown ? EyeOff : Eye;

  return (
    <div className={className}>
      <label htmlFor={id}>{label}</label>
      <div className="relative">
        <input
          {...props}
          id={id}
          type={shown ? 'text' : 'password'}
          className={`${inputClassName} pr-12`}
        />
        <button
          type="button"
          aria-label={shown ? 'Hide password' : 'Show password'}
          aria-pressed={shown}
          onClick={() => setShown((value) => !value)}
          className="absolute top-1/2 right-2 flex size-8 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full text-rt-ink-faint transition-colors hover:bg-rt-ink/5 hover:text-rt-ink focus-visible:ring-2 focus-visible:ring-rt-secondary focus-visible:outline-none"
        >
          <Icon aria-hidden size={17} strokeWidth={2} />
        </button>
      </div>
    </div>
  );
}
