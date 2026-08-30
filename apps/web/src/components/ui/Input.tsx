// Base text input + labelled field wrapper. Shared component (docs/06 Week 1 note).
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
        'block w-full rounded-lg bg-white px-3 py-2 text-sm text-slate-900 shadow-sm',
        'ring-1 ring-inset placeholder:text-slate-400',
        'focus:ring-2 focus:ring-inset focus:outline-none',
        invalid ? 'ring-red-400 focus:ring-red-500' : 'ring-slate-300 focus:ring-indigo-500',
        'disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500',
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
      <label htmlFor={id} className="block text-sm font-medium text-slate-700">
        {label}
      </label>
      {children({ id, invalid: Boolean(error) })}
      {error ? (
        <p className="text-xs text-red-600">{error}</p>
      ) : hint ? (
        <p className="text-xs text-slate-500">{hint}</p>
      ) : null}
    </div>
  );
}
