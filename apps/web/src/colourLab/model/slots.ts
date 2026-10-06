import { type Rgb, round8 } from '../colour/convert';

/**
 * One editable colour.
 *
 *   token:rt-ink     a brand token from the @theme block (--color-rt-ink)
 *   tw:red-600       a Tailwind palette colour the app uses (--color-red-600)
 *   hex:#080c15      a colour written straight into CSS, TS or an SVG, however it
 *                    was spelled; every occurrence of the same sRGB value is one slot
 *
 * Alpha is not part of a slot. A shadow at 12% and a hairline at 40% of the
 * same ink are one colour, and keep their own alpha when it is changed.
 */
export type SlotKey = string;

export type SlotKind = 'token' | 'tw' | 'hex';

const VAR_PREFIX = '--color-';

export function slotKeyForVar(name: string): SlotKey | null {
  if (!name.startsWith(VAR_PREFIX)) return null;
  const rest = name.slice(VAR_PREFIX.length);
  if (rest === '') return null;
  return rest.startsWith('rt-') ? `token:${rest}` : `tw:${rest}`;
}

export function varNameForSlot(key: SlotKey): string | null {
  const kind = slotKind(key);
  if (kind === 'hex') return null;
  return `${VAR_PREFIX}${key.slice(key.indexOf(':') + 1)}`;
}

export function slotKind(key: SlotKey): SlotKind {
  if (key.startsWith('token:')) return 'token';
  if (key.startsWith('tw:')) return 'tw';
  return 'hex';
}

export function hexSlotKey(rgb: Rgb): SlotKey {
  const part = (n: number): string => round8(n).toString(16).padStart(2, '0');
  return `hex:#${part(rgb.r)}${part(rgb.g)}${part(rgb.b)}`;
}

/** The colour of a hex slot, read from its own key. */
export function rgbOfHexSlot(key: SlotKey): Rgb | null {
  const match = /^hex:#([0-9a-f]{6})$/.exec(key);
  const digits = match?.[1];
  if (!digits) return null;
  return {
    r: parseInt(digits.slice(0, 2), 16),
    g: parseInt(digits.slice(2, 4), 16),
    b: parseInt(digits.slice(4, 6), 16),
  };
}

/** A packed number that is equal exactly when two colours are the same 8-bit sRGB. */
export const packRgb = ({ r, g, b }: Rgb): number =>
  (round8(r) << 16) | (round8(g) << 8) | round8(b);
