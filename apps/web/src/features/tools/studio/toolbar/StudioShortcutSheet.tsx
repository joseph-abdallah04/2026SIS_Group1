import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';

import { STUDIO_SHORTCUTS } from '../studioShortcuts';

/**
 * Keys the canvas answers to that are not tool shortcuts.
 *
 * Written out rather than derived: they are handled across several branches of
 * the canvas's key handler, and a list that drifted from the code would be worse
 * than no list. The tests below keep the tool half honest; this half is prose
 * and is checked by reading it.
 */
const CANVAS_KEYS: { keys: string; description: string }[] = [
  { keys: 'Ctrl+Z', description: 'Undo' },
  { keys: 'Ctrl+Shift+Z', description: 'Redo' },
  { keys: 'Ctrl+A', description: 'Select everything' },
  { keys: 'Ctrl+C / Ctrl+V', description: 'Copy and paste' },
  { keys: 'Ctrl+D', description: 'Duplicate' },
  { keys: 'Delete', description: 'Delete the selection' },
  { keys: 'Arrows', description: 'Nudge the selection' },
  { keys: 'Enter', description: 'Edit the selected element' },
  { keys: 'Escape', description: 'Step out, then clear the selection' },
  { keys: 'Space (held)', description: 'Pan the canvas' },
  { keys: 'Shift (held)', description: 'Constrain a pen or line to 45°' },
];

interface StudioShortcutSheetProps {
  open: boolean;
  onClose: () => void;
}

function Row({ keys, description }: { keys: string; description: string }) {
  return (
    <div className="flex items-center justify-between gap-4 py-1">
      <span className="text-[12px] text-rt-ink-muted">{description}</span>
      <kbd className="shrink-0 rounded border border-rt-tertiary bg-rt-surface-alt px-1.5 py-0.5 font-sans text-[11px] text-rt-ink">
        {keys}
      </kbd>
    </div>
  );
}

/**
 * The shortcut sheet.
 *
 * Tooltips teach a shortcut to whoever hovers, which is nobody on a touch
 * screen and nobody who is already using the keyboard. This is the other half of
 * that: one place that says what every key does, reachable by pressing `?` and
 * by a button, because a shortcut you can only discover with a shortcut is not
 * discoverable.
 */
export function StudioShortcutSheet({ open, onClose }: StudioShortcutSheetProps) {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      onClose();
    }

    document.addEventListener('keydown', onKeyDown, true);
    return () => document.removeEventListener('keydown', onKeyDown, true);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Keyboard shortcuts"
      className="rt-studio-fade pointer-events-auto absolute inset-0 z-40 flex items-center justify-center bg-rt-ink/25 p-4"
      onPointerDown={(event) => {
        // Only a press on the backdrop itself closes it.
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="max-h-full w-full max-w-md overflow-y-auto rounded-xl border border-rt-tertiary bg-rt-surface p-4 shadow-[0_12px_40px_rgba(8,12,21,0.24)]">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-[13px] font-semibold text-rt-ink">Keyboard shortcuts</h2>
          <button
            ref={closeRef}
            type="button"
            aria-label="Close shortcuts"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-rt-tertiary text-rt-ink-muted transition-colors hover:bg-rt-primary-tint hover:text-rt-ink focus-visible:ring-2 focus-visible:ring-rt-primary focus-visible:outline-none"
          >
            <X aria-hidden="true" size={16} />
          </button>
        </div>

        <p className="mt-3 text-[10px] font-semibold tracking-[0.12em] text-rt-ink-faint uppercase">
          Tools
        </p>
        <div className="mt-1">
          {STUDIO_SHORTCUTS.map((entry) => (
            <Row key={entry.key} keys={entry.label} description={entry.description} />
          ))}
        </div>

        <p className="mt-3 text-[10px] font-semibold tracking-[0.12em] text-rt-ink-faint uppercase">
          Canvas
        </p>
        <div className="mt-1">
          {CANVAS_KEYS.map((entry) => (
            <Row key={entry.keys} keys={entry.keys} description={entry.description} />
          ))}
        </div>
      </div>
    </div>
  );
}
