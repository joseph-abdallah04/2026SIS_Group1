import type { ButtonHTMLAttributes } from 'react';

const TONE_CLASSES = {
  surface:
    'border-rt-tertiary bg-rt-surface text-rt-ink-muted hover:bg-rt-primary-tint hover:text-rt-ink',
  inverse: 'border-white/30 bg-white/10 text-white hover:bg-white/20',
} as const;

interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'aria-label'> {
  label: string;
  tone?: keyof typeof TONE_CLASSES;
}

export function IconButton({
  className = '',
  label,
  title = label,
  tone = 'surface',
  type = 'button',
  ...props
}: IconButtonProps) {
  return (
    <button
      type={type}
      aria-label={label}
      title={title}
      className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border transition-colors focus-visible:ring-2 focus-visible:ring-rt-secondary focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-45 ${TONE_CLASSES[tone]} ${className}`}
      {...props}
    />
  );
}
