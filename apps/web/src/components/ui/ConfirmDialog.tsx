import { useId, type ReactNode } from 'react';

interface ConfirmDialogProps {
  title: string;
  children: ReactNode;
  confirmLabel: string;
  confirmingLabel?: string;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Centered overlay for irreversible exits (end session / leave session).
 * Kept in the header as a *trigger* only — the confirm itself sits in the
 * middle of the window so it is not mistaken for another header control.
 */
export function ConfirmDialog({
  title,
  children,
  confirmLabel,
  confirmingLabel,
  busy,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const titleId = useId();

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-rt-ink/40 p-4"
      role="presentation"
      onClick={busy ? undefined : onCancel}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="w-full max-w-sm rounded-xl border border-rt-tertiary bg-rt-surface p-5 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id={titleId} className="text-[16px] font-semibold tracking-[-0.01em] text-rt-ink">
          {title}
        </h2>
        <div className="mt-2 text-[13px] leading-relaxed text-rt-ink-muted">{children}</div>
        <div className="mt-5 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="rounded-lg px-3 py-2 text-[13px] font-semibold text-rt-ink-muted hover:bg-rt-primary-tint hover:text-rt-ink"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className="rounded-lg bg-red-600 px-3 py-2 text-[13px] font-semibold text-white hover:bg-red-700 disabled:opacity-60"
          >
            {busy ? (confirmingLabel ?? confirmLabel) : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
