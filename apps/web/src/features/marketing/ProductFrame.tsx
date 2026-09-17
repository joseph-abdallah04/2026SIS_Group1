import type { ReactNode } from 'react';

/**
 * Chrome around a product mock. Gold dots instead of traffic lights, so the
 * frame feels like RoundTable rather than a generic browser window.
 */
export function ProductFrame({
  title,
  meta,
  badge,
  footer,
  children,
  className = '',
}: {
  title: string;
  meta?: string;
  badge?: string;
  footer?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`rt-landing-panel overflow-hidden rounded-2xl ${className}`}>
      <div className="flex items-center gap-3 border-b border-rt-secondary/15 bg-white/70 px-4 py-3">
        <span className="flex gap-1" aria-hidden="true">
          <span className="h-1.5 w-1.5 rounded-full bg-[#e8d4a8]" />
          <span className="h-1.5 w-1.5 rounded-full bg-[#f1c881]" />
          <span className="h-1.5 w-1.5 rounded-full bg-[#e0a33c]" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-serif text-[14px] font-bold text-rt-ink">{title}</p>
          {meta ? <p className="truncate text-[10.5px] text-rt-ink-faint">{meta}</p> : null}
        </div>
        {badge ? (
          <span className="shrink-0 rounded-full bg-rt-cool-tint px-2 py-0.5 text-[9px] font-semibold tracking-[0.12em] text-rt-ink-muted uppercase">
            {badge}
          </span>
        ) : null}
      </div>
      {children}
      {footer ? (
        <div className="border-t border-rt-secondary/15 bg-white/70 px-4 py-3">{footer}</div>
      ) : null}
    </div>
  );
}
