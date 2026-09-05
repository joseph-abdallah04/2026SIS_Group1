import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

import { Button } from '../../components/ui/Button';

interface ConfirmRemoveDialogProps {
  /** How the proposal is described in the prompt, e.g. "sticky note". */
  kind: string;
  /** False when the leader is moderating a proposal someone else wrote. */
  isOwn: boolean;
  /** Disables both buttons while the removal is in flight. */
  pending: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

/**
 * Confirmation before a proposal is removed (F17).
 *
 * Deletion is destructive and there is no undo, so it takes a deliberate second
 * action. A dialog rather than an inline two-step: it names what is about to be
 * lost, and it says out loud that a leader is removing someone else's work.
 *
 * Rendered through a portal to `document.body`. Cards sit inside the canvas's
 * scale transform, and a transformed ancestor becomes the containing block for
 * its descendants — a dialog left in place would inherit the board's zoom and
 * be laid out against the card rather than the window.
 */
export function ConfirmRemoveDialog({
  kind,
  isOwn,
  pending,
  onCancel,
  onConfirm,
}: ConfirmRemoveDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  // `showModal` is what puts the dialog in the top layer and gives us focus
  // trapping, the backdrop and Escape handling for free.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog || dialog.open) return;
    dialog.showModal();
    return () => {
      if (dialog.open) dialog.close();
    };
  }, []);

  return createPortal(
    <dialog
      ref={dialogRef}
      aria-labelledby="confirm-remove-title"
      onCancel={(event) => {
        // Escape: close through the same path as Cancel so the parent's state
        // stays in step with whether the dialog is actually on screen.
        event.preventDefault();
        if (!pending) onCancel();
      }}
      onClick={(event) => {
        // A click on the backdrop lands on the dialog element itself.
        if (event.target === dialogRef.current && !pending) onCancel();
      }}
      className="m-auto w-[336px] max-w-[calc(100vw-32px)] rounded-xl border border-rt-tertiary bg-rt-surface p-0 text-rt-ink shadow-lg backdrop:bg-rt-ink/35"
    >
      <div className="p-5">
        <h2 id="confirm-remove-title" className="text-[15px] font-semibold tracking-[-0.01em]">
          Delete this proposal?
        </h2>
        <p className="mt-2 text-[13px] leading-relaxed text-rt-ink-muted">
          {isOwn
            ? `This can't be undone. Your ${kind} will be removed from everyone's board.`
            : `This can't be undone. You're removing someone else's ${kind} as session leader.`}
        </p>
      </div>
      <div className="flex items-center justify-end gap-2 border-t border-rt-tertiary px-5 py-3.5">
        <Button variant="quiet" onClick={onCancel} disabled={pending} autoFocus>
          Cancel
        </Button>
        <Button
          variant="primary"
          onClick={onConfirm}
          disabled={pending}
          className="bg-rt-secondary-deep hover:bg-rt-ink"
        >
          {pending ? 'Deleting…' : 'Delete'}
        </Button>
      </div>
    </dialog>,
    document.body,
  );
}
