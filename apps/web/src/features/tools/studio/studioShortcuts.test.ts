import { describe, expect, it } from 'vitest';

import { STUDIO_SHORTCUTS, shortcutLabelFor, toolForShortcut } from './studioShortcuts';

const idle = {
  editingText: false,
  inCellMode: false,
  submitting: false,
  drawing: false,
  modifier: false,
};

describe('what a key reaches', () => {
  it('picks the tool the letter names', () => {
    expect(toolForShortcut('v', idle)).toBe('select');
    expect(toolForShortcut('p', idle)).toBe('pen');
    expect(toolForShortcut('g', idle)).toBe('table');
  });

  it('takes the upper-case letter too, since Shift constrains angles', () => {
    expect(toolForShortcut('P', idle)).toBe('pen');
  });

  it('ignores a key that names nothing', () => {
    expect(toolForShortcut('q', idle)).toBeNull();
    expect(toolForShortcut('Enter', idle)).toBeNull();
  });

  it('gives every tool one key and no key two tools', () => {
    const keys = STUDIO_SHORTCUTS.map((entry) => entry.key);
    expect(new Set(keys).size).toBe(keys.length);
    const tools = STUDIO_SHORTCUTS.map((entry) => entry.tool);
    expect(new Set(tools).size).toBe(tools.length);
  });

  it('publishes the label a tooltip shows', () => {
    expect(shortcutLabelFor('pen')).toBe('P');
    expect(shortcutLabelFor('template')).toBeUndefined();
  });
});

describe('when a key means something else', () => {
  it('says nothing while a label or a cell is being typed into', () => {
    // The trap this whole module exists for: typing "Table" into a cell must
    // not arm the table tool on the T.
    expect(toolForShortcut('t', { ...idle, editingText: true })).toBeNull();
  });

  it('says nothing while a table is in cell mode, before the cell is open', () => {
    // A letter starts typing into the focused cell, so it is already spoken for.
    expect(toolForShortcut('t', { ...idle, inCellMode: true })).toBeNull();
  });

  it('says nothing while a proposal is in flight', () => {
    expect(toolForShortcut('v', { ...idle, submitting: true })).toBeNull();
  });

  it('says nothing mid-shape: a pen is finished with Enter or Escape', () => {
    expect(toolForShortcut('p', { ...idle, drawing: true })).toBeNull();
  });

  it('leaves every modified key to the canvas', () => {
    // Ctrl+V is paste, and it is not the select tool.
    expect(toolForShortcut('v', { ...idle, modifier: true })).toBeNull();
  });

  it('holds for every shortcut, not only the ones with an obvious clash', () => {
    for (const { key } of STUDIO_SHORTCUTS) {
      expect(toolForShortcut(key, { ...idle, editingText: true })).toBeNull();
      expect(toolForShortcut(key, { ...idle, inCellMode: true })).toBeNull();
      expect(toolForShortcut(key, { ...idle, submitting: true })).toBeNull();
      expect(toolForShortcut(key, { ...idle, drawing: true })).toBeNull();
      expect(toolForShortcut(key, { ...idle, modifier: true })).toBeNull();
      // ...and still works when nothing is in the way.
      expect(toolForShortcut(key, idle)).not.toBeNull();
    }
  });
});
