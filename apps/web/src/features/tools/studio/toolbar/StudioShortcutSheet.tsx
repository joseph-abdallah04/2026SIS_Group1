import { type RefObject } from 'react';

import { Popover } from '../../../../components/ui/Popover';
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
  /** The `?` button it hangs off; focus goes back there when it closes. */
  triggerRef: RefObject<HTMLElement | null>;
}

function Row({ keys, description }: { keys: string; description: string }) {
  return (
    <div className="flex items-center justify-between gap-4 py-0.5">
      <span className="text-[11px] text-rt-ink-muted">{description}</span>
      <kbd className="shrink-0 rounded border border-rt-tertiary bg-rt-surface-alt px-1 py-px font-sans text-[10px] text-rt-ink">
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
 *
 * A panel hanging off its own button rather than a modal over the canvas: it is
 * a reference to glance at while working, and dimming the whole board to read
 * one line of it is out of proportion to that.
 */
export function StudioShortcutSheet({ open, onClose, triggerRef }: StudioShortcutSheetProps) {
  return (
    <Popover
      open={open}
      onClose={onClose}
      label="Keyboard shortcuts"
      // Below the button, which now lives in the top-right corner: opening
      // upward would put the panel off the top of the canvas.
      placement="bottom-end"
      triggerRef={triggerRef}
    >
      <div className="max-h-[60vh] w-64 overflow-y-auto px-1 py-0.5">
        <p className="text-[10px] font-semibold tracking-[0.12em] text-rt-ink-faint uppercase">
          Tools
        </p>
        <div className="mt-1">
          {STUDIO_SHORTCUTS.map((entry) => (
            <Row key={entry.key} keys={entry.label} description={entry.description} />
          ))}
        </div>

        <p className="mt-2 text-[10px] font-semibold tracking-[0.12em] text-rt-ink-faint uppercase">
          Canvas
        </p>
        <div className="mt-1">
          {CANVAS_KEYS.map((entry) => (
            <Row key={entry.keys} keys={entry.keys} description={entry.description} />
          ))}
        </div>
      </div>
    </Popover>
  );
}
