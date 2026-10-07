import { type Role } from '../catalogue/types';
import { type Rgb, round8 } from '../colour/convert';
import { parseHex, toHex } from '../colour/parse';
import { darkSpec } from './dark';
import { isRoleKey, ROLE_KEYS } from './roles';
import { type Scheme, type SchemeEdits, type SlotEdit, type Spec } from './spec';
import { type SlotKey, packRgb, rgbOfHexSlot, slotKind } from './slots';

export type { Scheme, SchemeEdits, SlotEdit, Spec } from './spec';

export interface ResolveInput {
  scheme: Scheme;
  /** Authored values of the var slots, read from the stylesheets. */
  originals: ReadonlyMap<SlotKey, Rgb>;
  /** Hardcoded colours that start out following the token with the same value. */
  defaultLinks: ReadonlyMap<SlotKey, SlotKey>;
  edits: SchemeEdits;
}

/** The colour a slot has in the app as shipped. `null` for a slot nothing has defined. */
export function originalOf(slot: SlotKey, input: Pick<ResolveInput, 'originals'>): Rgb | null {
  if (slotKind(slot) === 'hex') return rgbOfHexSlot(slot);
  return input.originals.get(slot) ?? null;
}

/** What the user has set for a slot in a role, falling back to what they set for it overall. */
export function ownSpec(edit: SlotEdit | undefined, role: Role): Spec | undefined {
  return (isRoleKey(role) ? edit?.roles?.[role] : undefined) ?? edit?.base;
}

/** What a slot is when nobody has set it: the app's own, or the dark palette's. */
function defaultSpec(slot: SlotKey, role: Role, alpha: number, input: ResolveInput): Spec {
  const link = input.defaultLinks.get(slot);
  if (input.scheme === 'dark') {
    return darkSpec(slot, role, alpha, originalOf(slot, input), link);
  }
  return link ? { kind: 'link', slot: link } : { kind: 'original' };
}

/** The spec in force: the user's, else the default. */
export function effectiveSpec(slot: SlotKey, role: Role, input: ResolveInput, alpha = 1): Spec {
  return ownSpec(input.edits[slot], role) ?? defaultSpec(slot, role, alpha, input);
}

/**
 * The colour a slot should show in a role, right now.
 *
 * Always an absolute colour, never "unchanged": a link to a slot that has not
 * been touched resolves to that slot's original, which is what makes a link
 * between two slots of different values mean something. `alpha` is how
 * see-through the colour is where it is used, which a default may depend on:
 * white at a tenth is a highlight, white at nine tenths is a panel.
 */
export function resolveSlot(slot: SlotKey, role: Role, input: ResolveInput, alpha = 1): Rgb | null {
  return resolveWithin(slot, role, input, alpha, new Set());
}

function resolveWithin(
  slot: SlotKey,
  role: Role,
  input: ResolveInput,
  alpha: number,
  seen: Set<string>,
): Rgb | null {
  const original = originalOf(slot, input);
  const key = `${slot}|${role}`;
  if (seen.has(key)) return original;
  seen.add(key);
  const spec = effectiveSpec(slot, role, input, alpha);
  if (spec.kind === 'custom') {
    const hex = spec.wash && alpha <= spec.wash.upTo ? spec.wash.hex : spec.hex;
    const parsed = parseHex(hex)?.rgba;
    return parsed ? { r: parsed.r, g: parsed.g, b: parsed.b } : original;
  }
  if (spec.kind === 'link') return resolveWithin(spec.slot, role, input, alpha, seen) ?? original;
  return original;
}

/** What a slot would be with nothing set by the user. */
export function defaultColour(
  slot: SlotKey,
  role: Role,
  input: ResolveInput,
  alpha = 1,
): Rgb | null {
  return resolveSlot(slot, role, { ...input, edits: {} }, alpha);
}

export const sameColour = (a: Rgb | null, b: Rgb | null): boolean =>
  a !== null && b !== null && packRgb(a) === packRgb(b);

const ALL_ROLES: readonly Role[] = ['other', ...ROLE_KEYS];

/** The roles in which a slot is not what it is by default. */
export function changedRoles(slot: SlotKey, input: ResolveInput): Role[] {
  return ALL_ROLES.filter((role) => {
    const now = resolveSlot(slot, role, input);
    const before = defaultColour(slot, role, input);
    return now !== null && before !== null && !sameColour(now, before);
  });
}

export const isChanged = (slot: SlotKey, input: ResolveInput): boolean =>
  changedRoles(slot, input).length > 0;

/**
 * The hardcoded colours that match a var slot, each paired with the first slot
 * that has its value. Tokens win over Tailwind palette colours, and among
 * tokens the one declared first, so a gold that three tokens share follows
 * Primary rather than whichever happened to be listed last.
 */
export function computeDefaultLinks(
  originals: ReadonlyMap<SlotKey, Rgb>,
  hexSlots: Iterable<SlotKey>,
): Map<SlotKey, SlotKey> {
  const byColour = new Map<number, SlotKey>();
  const ordered = [...originals].sort(
    ([a], [b]) => Number(slotKind(a) !== 'token') - Number(slotKind(b) !== 'token'),
  );
  for (const [slot, rgb] of ordered) {
    const packed = packRgb(rgb);
    if (!byColour.has(packed)) byColour.set(packed, slot);
  }
  const links = new Map<SlotKey, SlotKey>();
  for (const slot of hexSlots) {
    const rgb = rgbOfHexSlot(slot);
    const target = rgb ? byColour.get(packRgb(rgb)) : undefined;
    if (target) links.set(slot, target);
  }
  return links;
}

/** A custom spec from a colour. */
export const customSpec = (rgb: Rgb): Spec => ({
  kind: 'custom',
  hex: toHex({ r: round8(rgb.r), g: round8(rgb.g), b: round8(rgb.b) }),
});
