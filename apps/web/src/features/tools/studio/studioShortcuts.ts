// Single-key shortcuts for the studio's tools, and — the part that matters —
// when they must not fire.
//
// The canvas already gives a plain letter a meaning: typing one into a selected
// table cell replaces it, exactly as a spreadsheet does. So "T selects the table
// tool" and "T types a T" are the same keystroke, and which one happens can only
// be decided from what the canvas is in the middle of. Getting that wrong is not
// a cosmetic bug: it silently switches tools while someone is writing.
//
// Kept as a pure function so the whole matrix can be checked without a canvas.

import type { RailTool } from './toolbar/StudioToolRail';

export interface StudioShortcut {
  key: string;
  tool: RailTool;
  /** How the key is written in a tooltip and on the shortcut sheet. */
  label: string;
  /** What it does, for the sheet. */
  description: string;
}

/**
 * The tools a single key can reach.
 *
 * One letter each, and the letter is the first letter of the tool wherever that
 * was free — V for select is the exception, and it is the exception in every
 * other canvas tool for the same reason: S was taken long before any of them.
 */
export const STUDIO_SHORTCUTS: readonly StudioShortcut[] = [
  { key: 'v', tool: 'select', label: 'V', description: 'Select' },
  { key: 'b', tool: 'draw', label: 'B', description: 'Freehand' },
  { key: 'e', tool: 'erase', label: 'E', description: 'Erase' },
  { key: 'p', tool: 'pen', label: 'P', description: 'Pen' },
  { key: 'l', tool: 'line', label: 'L', description: 'Line' },
  { key: 'r', tool: 'shape', label: 'R', description: 'Shape' },
  { key: 't', tool: 'text', label: 'T', description: 'Text' },
  { key: 'g', tool: 'table', label: 'G', description: 'Table' },
];

const TOOL_FOR_KEY = new Map(STUDIO_SHORTCUTS.map((entry) => [entry.key, entry.tool]));

/** The label a tooltip should show for a tool, if it has a shortcut. */
export function shortcutLabelFor(tool: RailTool): string | undefined {
  return STUDIO_SHORTCUTS.find((entry) => entry.tool === tool)?.label;
}

/**
 * What the canvas is busy with. Every field here is a reason a letter means
 * something other than "change tool".
 */
export interface ShortcutContext {
  /** A label or a cell is open for editing: the letter is being typed. */
  editingText: boolean;
  /**
   * A table is selected with a cell range but not yet open. A letter starts
   * typing into that cell, so it cannot also change the tool.
   */
  inCellMode: boolean;
  /** A proposal is in flight; changing tools would strand it. */
  submitting: boolean;
  /** A pen or line is mid-shape. Finish it with Enter or Escape, not with P. */
  drawing: boolean;
  /** Ctrl, Meta or Alt is held — those combinations belong to the canvas. */
  modifier: boolean;
}

/**
 * The tool a keystroke asks for, or null if it asks for nothing.
 *
 * Null is the safe answer and the common one: every guard below returns it, and
 * the caller falls through to whatever the key would otherwise have done.
 */
export function toolForShortcut(key: string, context: ShortcutContext): RailTool | null {
  if (context.modifier) return null;
  if (context.submitting) return null;
  // Typing beats every shortcut. A letter that switched tools mid-sentence would
  // be indistinguishable from the application losing its mind.
  if (context.editingText || context.inCellMode) return null;
  if (context.drawing) return null;
  // Shift is not a modifier here — it constrains angles — but an upper-case
  // letter is still the same key, so the comparison is case-insensitive.
  return TOOL_FOR_KEY.get(key.toLowerCase()) ?? null;
}
