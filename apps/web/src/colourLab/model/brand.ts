import { type SlotKey, slotKind } from './slots';

export interface SlotLabel {
  label: string;
  hint: string;
}

/**
 * What each brand token is for, in the words a designer would use. Taken from
 * the comments in index.css and from where the classes are used. A token that
 * is not listed here (one added on main later) is labelled from its own name.
 */
const BRAND: Record<string, SlotLabel> = {
  'rt-primary': {
    label: 'Primary',
    hint: 'Light gold: chrome, active tool tiles, scrollbar thumbs, focus outlines',
  },
  'rt-primary-deep': {
    label: 'Primary deep',
    hint: 'Dark gold-brown: secondary text on gold, profile focus rings',
  },
  'rt-primary-tint': {
    label: 'Primary tint',
    hint: 'Palest gold: hover fill on buttons and menu items',
  },
  'rt-secondary': {
    label: 'Secondary',
    hint: 'Mustard: calls to action, the default focus ring, many borders',
  },
  'rt-secondary-tint': {
    label: 'Secondary tint',
    hint: 'Light gold: the active tab in Settings (same value as Primary today)',
  },
  'rt-secondary-wash': {
    label: 'Secondary wash',
    hint: 'Page background wash, selected fills (same value as Primary tint today)',
  },
  'rt-secondary-deep': {
    label: 'Secondary deep',
    hint: 'Dark gold-brown: link and label text, button hover fill',
  },
  'rt-cool': { label: 'Cool', hint: 'Pale blue: live dots, tool ink, vote rings' },
  'rt-cool-deep': { label: 'Cool deep', hint: 'Slate blue: links in notes, vote results' },
  'rt-cool-tint': { label: 'Cool tint', hint: 'Palest blue: cool backgrounds, timeline chips' },
  'rt-tertiary': {
    label: 'Border grey',
    hint: 'The universal hairline: borders, dividers, tracks',
  },
  'rt-surface': { label: 'Surface', hint: 'White: cards, panels, inputs' },
  'rt-surface-alt': { label: 'Surface alt', hint: 'Off-white: rails, hover fills, card plates' },
  'rt-surface-sunken': { label: 'Surface sunken', hint: 'Faint grey: wells and canvas beds' },
  'rt-ink': { label: 'Ink', hint: 'Main text and icons' },
  'rt-ink-muted': { label: 'Ink muted', hint: 'Secondary text' },
  'rt-ink-faint': { label: 'Ink faint', hint: 'Placeholders, captions, disabled text' },
};

const title = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1);

/** Display name for a var slot. Hex slots are named by their value, elsewhere. */
export function labelForSlot(key: SlotKey): SlotLabel {
  const kind = slotKind(key);
  const name = key.slice(key.indexOf(':') + 1);
  if (kind === 'token') {
    return BRAND[name] ?? { label: title(name.replace(/^rt-/, '').replace(/-/g, ' ')), hint: '' };
  }
  if (kind === 'tw') {
    const [family, shade] = name.split('-');
    const label = shade ? `${title(family ?? name)} ${shade}` : title(name);
    const hint =
      name === 'white'
        ? 'Tailwind white: text on dark fills, white overlays'
        : name === 'black'
          ? 'Tailwind black: ring and shadow tints'
          : family === 'red'
            ? 'Tailwind red: errors and destructive actions'
            : 'Tailwind palette colour';
    return { label, hint };
  }
  return { label: name, hint: '' };
}
