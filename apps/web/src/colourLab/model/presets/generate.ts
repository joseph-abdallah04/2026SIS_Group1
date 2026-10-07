import { type Catalogue, type Role } from '../../catalogue/types';
import { type Rgb, rgbToOklch } from '../../colour/convert';
import { toHex } from '../../colour/parse';
import { heuristicDark } from '../dark';
import { type RoleKey, isRoleKey } from '../roles';
import { type SchemeEdits, type SlotEdit, type Spec } from '../spec';
import { type SlotKey, rgbOfHexSlot } from '../slots';
import {
  type Palette,
  type RoleColours,
  type ThemeColours,
  TOKEN_NAMES,
  darkColours,
  fit,
  lightColours,
} from './palettes';

export interface PresetEdits {
  light: SchemeEdits;
  dark: SchemeEdits;
}

export interface PresetContext {
  catalogue: Catalogue;
  originals: ReadonlyMap<SlotKey, Rgb>;
  defaultLinks: ReadonlyMap<SlotKey, SlotKey>;
}

/** The colours of the four sticky papers as the app ships them. */
export const PAPER_SLOTS = {
  yellow: 'hex:#fdf4e5',
  pink: 'hex:#f9eef2',
  blue: 'hex:#eef2f4',
  green: 'hex:#eef4f0',
} as const;

/** The plate behind a drawing or a diagram on a card, a copy of the rail colour. */
export const PLATE_SLOT = 'hex:#f7f7f8';

const custom = (hex: string, wash?: RoleColours['wash']): Spec =>
  wash ? { kind: 'custom', hex, wash } : { kind: 'custom', hex };

const ROLES_OF_COLOURS: readonly ('text' | 'fill' | 'border')[] = ['text', 'fill', 'border'];

/** A token's colours by role, as an edit: the colour overall, and each role that differs. */
function editOf(colours: RoleColours): SlotEdit {
  const roles: Partial<Record<RoleKey, Spec>> = {};
  for (const role of ROLES_OF_COLOURS) {
    const value = colours[role];
    if (role === 'fill' && (value || colours.wash))
      roles.fill = custom(value ?? colours.base, colours.wash);
    else if (value) roles[role] = custom(value);
  }
  return Object.keys(roles).length > 0
    ? { base: custom(colours.base), roles }
    : { base: custom(colours.base) };
}

const toHexRgb = (rgb: Rgb): string =>
  toHex({ r: Math.round(rgb.r), g: Math.round(rgb.g), b: Math.round(rgb.b) });

/**
 * A hardcoded colour moved into a palette's hues, its lightness kept so it does the same job.
 * `null` leaves it as it is: pure white and black, and reds and pinks, which are errors and
 * warnings and have to stay recognisable as such.
 */
export function remap(rgb: Rgb, palette: Palette): Rgb | null {
  const { L, C, h } = rgbToOklch(rgb);
  const hue = ((h % 360) + 360) % 360;
  if (C < 0.015) {
    if (L > 0.97 || L < 0.1) return null;
    return fit({ L, C: 0.008 * palette.tint, h: palette.hues.neutral });
  }
  if (hue >= 345 || hue < 40) return null;
  // Pastel: the lighter the colour, the less colour it may carry.
  const cap = (0.035 + (1 - L) * 0.22) * palette.chroma;
  const to = (target: number, chroma = Math.min(C, cap)): Rgb => fit({ L, C: chroma, h: target });
  if (hue < 115) {
    // The warm family: creams lean to the page, golds to the button colour.
    return C < 0.045
      ? to(palette.hues.neutral, Math.min(C, 0.03) * palette.tint)
      : to(palette.hues.secondary);
  }
  if (hue < 275) return to(palette.hues.cool);
  return to(palette.hues.primary);
}

/** The roles each hardcoded colour is used in, from the catalogue. */
function rolesBySlot(catalogue: Catalogue): Map<SlotKey, Set<Role>> {
  const out = new Map<SlotKey, Set<Role>>();
  for (const literal of catalogue.literals) {
    const roles = out.get(literal.slot) ?? new Set<Role>();
    roles.add(literal.role);
    out.set(literal.slot, roles);
  }
  return out;
}

/** A light colour's edit for the dark theme: what the dark rule makes of it in each role it is used in. */
function darkEditOf(light: Rgb, roles: ReadonlySet<Role>): SlotEdit {
  const base = toHexRgb(heuristicDark(light, 'other'));
  const byRole: Partial<Record<RoleKey, Spec>> = {};
  for (const role of roles) {
    if (!isRoleKey(role)) continue;
    const value = toHexRgb(heuristicDark(light, role));
    if (value !== base) byRole[role] = custom(value);
  }
  return Object.keys(byRole).length > 0
    ? { base: custom(base), roles: byRole }
    : { base: custom(base) };
}

function tokenEdits(colours: ThemeColours, context: PresetContext): Record<SlotKey, SlotEdit> {
  const edits: Record<SlotKey, SlotEdit> = {};
  for (const name of TOKEN_NAMES) {
    const slot = `token:rt-${name}`;
    if (context.originals.has(slot)) edits[slot] = editOf(colours[name]);
  }
  if (context.originals.has('tw:white')) edits['tw:white'] = editOf(colours.white);
  return edits;
}

/**
 * A palette as the lab's own edits, for both themes. The same palette and the same catalogue give
 * the same edits, so applying one, saving it and making a prompt from it all agree.
 *
 * Brand colours are set outright. A hardcoded copy of a brand colour keeps following it. The four
 * sticky papers are set to the palette's own papers, so they change with it and stay apart. Every
 * other hardcoded colour is moved into the palette's hues; in the dark it is what the lab's dark
 * rule makes of the moved colour.
 */
export function buildPreset(palette: Palette, context: PresetContext): PresetEdits {
  const light: Record<SlotKey, SlotEdit> = tokenEdits(lightColours(palette), context);
  const dark: Record<SlotKey, SlotEdit> = tokenEdits(darkColours(palette), context);
  const roles = rolesBySlot(context.catalogue);
  const papers = new Map<SlotKey, string>(
    (Object.keys(PAPER_SLOTS) as (keyof typeof PAPER_SLOTS)[]).map((name) => [
      PAPER_SLOTS[name],
      palette.paper[name],
    ]),
  );
  if (palette.plate) papers.set(PLATE_SLOT, palette.plate);

  const slots = [...new Set(context.catalogue.literals.map((l) => l.slot))].sort();
  for (const slot of slots) {
    const original = rgbOfHexSlot(slot);
    if (!original) continue;
    const paper = papers.get(slot);
    let moved: Rgb | null = null;
    if (paper) {
      moved = rgbOfHexSlot(`hex:${paper}`);
    } else if (!context.defaultLinks.has(slot)) {
      moved = remap(original, palette);
    }
    if (!moved) continue;
    light[slot] = { base: custom(toHexRgb(moved)) };
    dark[slot] = darkEditOf(moved, roles.get(slot) ?? new Set<Role>(['other']));
  }
  return { light, dark };
}

/** Every built-in palette's edits, by id. The baseline is no edits at all. */
export function presetEditsFor(palette: Palette | null, context: PresetContext): PresetEdits {
  return palette ? buildPreset(palette, context) : { light: {}, dark: {} };
}
