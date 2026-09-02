import type { ButtonHTMLAttributes } from 'react';

const VARIANT_CLASSES = {
  primary: 'bg-rt-primary-deep text-white hover:bg-rt-ink',
  secondary: 'border border-rt-tertiary bg-rt-surface text-rt-ink hover:bg-rt-surface-alt',
  quiet: 'text-rt-ink-muted hover:bg-rt-primary-tint hover:text-rt-ink',
} as const;

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: keyof typeof VARIANT_CLASSES;
}

export function Button({
  className = '',
  type = 'button',
  variant = 'primary',
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={`inline-flex min-h-10 items-center justify-center gap-2 rounded-lg px-4 text-[13px] font-semibold transition-colors focus-visible:ring-2 focus-visible:ring-rt-primary-deep focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-45 ${VARIANT_CLASSES[variant]} ${className}`}
      {...props}
    />
  );
}
