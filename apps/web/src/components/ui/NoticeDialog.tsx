import { useId, type ReactNode } from 'react';

import { Button } from './Button';

interface NoticeDialogProps {
  title: string;
  children: ReactNode;
  dismissLabel?: string;
  onDismiss: () => void;
}

/**
 * Centered overlay for a message that is not an irreversible confirm —
 * join-code failures, etc. Same chrome as `ConfirmDialog`, one dismiss button.
 */
export function NoticeDialog({
  title,
  children,
  dismissLabel = 'OK',
  onDismiss,
}: NoticeDialogProps) {
  const titleId = useId();

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-rt-ink/40 p-4"
      role="presentation"
      onClick={onDismiss}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="w-full max-w-sm rounded-xl border border-rt-tertiary bg-rt-surface p-5 shadow-lg"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id={titleId} className="text-[16px] font-semibold tracking-[-0.01em] text-rt-ink">
          {title}
        </h2>
        <div className="mt-2 text-[13px] leading-relaxed text-rt-ink-muted">{children}</div>
        <div className="mt-5 flex items-center justify-end">
          <Button type="button" onClick={onDismiss}>
            {dismissLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
