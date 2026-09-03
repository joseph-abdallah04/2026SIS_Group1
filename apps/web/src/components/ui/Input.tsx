// Base text input + labelled field wrapper, in the RoundTable palette.
//
// The shared `Button` lives next door and is the design system's; this is the matching
// input, added by the assistant owner for the settings form. Move it into the design
// system proper if another screen needs one.
import { useId, type InputHTMLAttributes, type ReactNode } from 'react';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean;
}

export function Input({ invalid = false, className = '', ...rest }: InputProps) {
  return (
    <input
      {...rest}
      aria-invalid={invalid || undefined}
      className={[
        'block w-full rounded-lg bg-rt-surface px-3 py-2 text-sm text-rt-ink',
        'ring-1 ring-inset placeholder:text-rt-ink-faint',
        'focus:ring-2 focus:ring-inset focus:outline-none',
        invalid ? 'ring-red-400 focus:ring-red-500' : 'ring-rt-tertiary focus:ring-rt-primary-deep',
        'disabled:cursor-not-allowed disabled:bg-rt-surface-alt disabled:text-rt-ink-faint',
        className,
      ].join(' ')}
    />
  );
}

export interface FieldProps {
  label: string;
  hint?: ReactNode;
  error?: string;
  children: (props: { id: string; invalid: boolean }) => ReactNode;
}

/**
 * Label + hint + error around any control, wired up with a generated id so the label
 * actually points at its input.
 */
export function Field({ label, hint, error, children }: FieldProps) {
  const id = useId();
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-medium text-rt-ink">
        {label}
      </label>
      {children({ id, invalid: Boolean(error) })}
      {error ? (
        <p className="text-xs text-red-600">{error}</p>
      ) : hint ? (
        <p className="text-xs text-rt-ink-muted">{hint}</p>
      ) : null}
    </div>
  );
}
