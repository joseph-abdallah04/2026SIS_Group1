import { splitTopLevel } from '../engine/selectors';
import { type Role } from './types';

/**
 * The role of a CSS property, or of a Tailwind custom property that carries one.
 * A custom property of the app's own is read from its name, since it says what
 * it is for: `--rt-paper`, `--rt-chip-edge`, `--rt-assistant-ink`.
 */
export function roleOfProperty(property: string): Role {
  const name = property.toLowerCase();
  if (name.includes('shadow')) return 'shadow';
  if (
    name === 'color' ||
    name === 'caret-color' ||
    name.endsWith('text-fill-color') ||
    name.startsWith('text-decoration') ||
    name.startsWith('text-emphasis')
  ) {
    return 'text';
  }
  if (
    name.startsWith('border') ||
    name.startsWith('outline') ||
    name === 'stroke' ||
    name === 'scrollbar-color' ||
    name.includes('ring') ||
    name.includes('divide') ||
    name === 'column-rule-color'
  ) {
    return 'border';
  }
  if (
    name.startsWith('background') ||
    name === 'fill' ||
    name === 'stop-color' ||
    name === 'flood-color' ||
    name === 'accent-color' ||
    name.includes('gradient')
  ) {
    return 'fill';
  }
  if (name.startsWith('--') && !name.startsWith('--tw-')) return roleOfName(name.slice(2));
  return 'other';
}

/**
 * The role of one layer of a shadow. A layer with no blur is a ring or an edge
 * drawn with a shadow, and is a border for the purpose of choosing a colour: a
 * soft shadow wants to stay dark in a dark theme, a ring wants to stay seen.
 */
export function roleOfShadowLayer(layer: string): Role {
  const lengths = layer
    .replace(/(rgba?|hsla?|oklch|oklab)\([^)]*\)/gi, '')
    .split(/\s+/)
    .filter((token) => /^-?(\d+\.?\d*|\.\d+)(px|r?em)?$/.test(token));
  const blur = lengths[2];
  if (blur === undefined) return 'shadow';
  return parseFloat(blur) > 0 ? 'shadow' : 'border';
}

/** The role a Tailwind utility prefix gives its colour: bg, text, ring, shadow. */
export function roleOfUtility(prefix: string): Role {
  if (prefix.includes('shadow')) return 'shadow';
  if (prefix === 'text' || prefix === 'decoration' || prefix === 'caret') return 'text';
  if (prefix.startsWith('border') || prefix.startsWith('ring') || prefix === 'outline') {
    return 'border';
  }
  if (prefix === 'stroke' || prefix === 'divide') return 'border';
  return 'fill';
}

/** A guess from the name of a constant, a prop or an object key. */
export function roleOfName(name: string): Role {
  const lower = name.toLowerCase();
  if (lower.includes('shadow')) return 'shadow';
  if (/(border|outline|ring|stroke|edge|line|rule)/.test(lower)) return 'border';
  if (/(fill|background|bg|paper|surface|plate|swatch|wash|tint|panel)/.test(lower)) return 'fill';
  if (/(color|colour|ink|text|label|foreground|fg)/.test(lower)) return 'text';
  return 'other';
}

/**
 * The role of the colour at `offset` in the value of `property`. A property says what a
 * colour is for, but a shadow holds several layers and each is told apart: a soft
 * shadow is a shadow, a ring drawn with one is a border. The live engine reads
 * values the same way, so what the source says and what the page does agree.
 */
export function roleAtOffset(property: string, value: string, offset: number): Role {
  const role = roleOfProperty(property);
  if (!/shadow/i.test(property)) return role;
  let start = 0;
  for (const layer of splitTopLevel(value, ',')) {
    const end = start + layer.length + 1;
    if (offset < end) return roleOfShadowLayer(layer);
    start = end;
  }
  return role;
}
