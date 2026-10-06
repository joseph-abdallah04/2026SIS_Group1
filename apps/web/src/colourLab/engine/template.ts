import { roleOfShadowLayer } from '../catalogue/roles';
import { type Role } from '../catalogue/types';
import { type Rgb } from '../colour/convert';
import { type ParsedColour, formatCss, formatLike } from '../colour/parse';
import { findColourTokens, findColourVars } from '../colour/tokens';
import { type SlotKey, hexSlotKey, slotKeyForVar } from '../model/slots';
import { splitTopLevel } from './selectors';

/** A colour written out in a value: `#f1c881`, `rgba(8, 12, 21, 0.1)`. */
export interface ColourPart {
  kind: 'colour';
  text: string;
  slot: SlotKey;
  alpha: number;
  /** `null` for a colour written as a name, which is rewritten as hex. */
  like: ParsedColour | null;
  role: Role;
}

/** A read of a brand token or palette colour: `var(--color-rt-ink)`. */
export interface VarPart {
  kind: 'var';
  text: string;
  slot: SlotKey;
  /** The opacity it is mixed in at, 1 when it is used as it is. */
  alpha: number;
  role: Role;
}

export type Part = string | ColourPart | VarPart;

/** A CSS value cut into the text around its colours and the colours themselves. */
export interface Template {
  original: string;
  parts: Part[];
  slots: SlotKey[];
}

/** One variable a template can read, and what it is for. */
export interface VarUse {
  name: string;
  slot: SlotKey;
  role: Role;
  alpha: number;
}

/**
 * Whether a colour in a given role is to be read from the lab's variable for it,
 * rather than as the app wrote it.
 */
export interface Painter {
  reads(slot: SlotKey, role: Role, alpha: number): boolean;
}

/** A slot's id as it can appear in a custom property name. */
const slotId = (slot: SlotKey): string => slot.replace(/^hex:#/, 'hex-').replace(':', '-');

/**
 * The variable that carries a slot's colour in one role, at one opacity.
 *
 * A variable and not the colour itself, so that choosing a colour changes one
 * stylesheet and not thousands of declarations; and so that a part of the page
 * can say it wants the original, by setting the variable to `initial`, which is
 * what keeps board content light in a dark theme.
 */
export function varNameFor(role: Role, slot: SlotKey, alpha: number): string {
  const opacity = alpha < 1 ? `-${Math.round(alpha * 1000)}` : '';
  return `--cl-${role}-${slotId(slot)}${opacity}`;
}

export const partVar = (part: ColourPart | VarPart): VarUse => ({
  name: varNameFor(part.role, part.slot, part.alpha),
  slot: part.slot,
  role: part.role,
  alpha: part.alpha,
});

/** The roles of a shadow's layers: a soft shadow is one, a ring drawn with a shadow is a border. */
function layerRoles(value: string): { end: number; role: Role }[] {
  const out: { end: number; role: Role }[] = [];
  let offset = 0;
  for (const layer of splitTopLevel(value, ',')) {
    offset += layer.length + 1;
    out.push({ end: offset, role: roleOfShadowLayer(layer) });
  }
  return out;
}

/**
 * `null` when the value has no colour to edit. See-through colours do not count:
 * nothing shows.
 *
 * `role` is what the property is for. A shadow is told apart layer by layer, since
 * one declaration can hold a soft shadow and a ring.
 */
export function buildTemplate(value: string, role: Role, property = ''): Template | null {
  const vars = findColourVars(value);
  const colours = findColourTokens(value).filter(
    (token) =>
      token.colour.rgba.a > 0 && !vars.some((v) => token.start >= v.start && token.end <= v.end),
  );
  if (vars.length === 0 && colours.length === 0) return null;

  const layers = /shadow/i.test(property) ? layerRoles(value) : null;
  const roleAt = (index: number): Role =>
    layers ? (layers.find((layer) => index < layer.end)?.role ?? role) : role;

  const spans = [
    ...vars.map((v) => ({ start: v.start, end: v.end, part: partOfVar(v, roleAt(v.start)) })),
    ...colours.map((token) => ({
      start: token.start,
      end: token.end,
      part: {
        kind: 'colour' as const,
        text: token.text,
        slot: hexSlotKey(token.colour.rgba),
        alpha: token.colour.rgba.a,
        like: token.colour,
        role: roleAt(token.start),
      },
    })),
  ].sort((a, b) => a.start - b.start);

  const parts: Part[] = [];
  const slots = new Set<SlotKey>();
  let last = 0;
  for (const span of spans) {
    if (span.start > last) parts.push(value.slice(last, span.start));
    parts.push(span.part);
    slots.add(span.part.slot);
    last = span.end;
  }
  if (last < value.length) parts.push(value.slice(last));
  return { original: value, parts, slots: [...slots] };
}

function partOfVar(span: { text: string; name: string; alpha: number }, role: Role): VarPart {
  const slot = slotKeyForVar(span.name) ?? span.name;
  return { kind: 'var', text: span.text, slot, alpha: span.alpha, role };
}

/**
 * The value with each colour that is to be changed reading its variable, the
 * app's own colour as the fallback. A colour that is not to be changed stays
 * exactly as written, so a value with nothing to say is returned untouched.
 */
export function renderTemplate(template: Template, painter: Painter): string {
  let out = '';
  for (const part of template.parts) {
    if (typeof part === 'string') out += part;
    else if (painter.reads(part.slot, part.role, part.alpha)) {
      out += `var(${varNameFor(part.role, part.slot, part.alpha)}, ${part.text})`;
    } else out += part.text;
  }
  return out;
}

/**
 * The value with colours swapped for others outright. For an SVG shown as a
 * picture, which no stylesheet or variable of the page can reach.
 */
export function renderValues(
  template: Template,
  valueFor: (slot: SlotKey, role: Role, alpha: number) => Rgb | null,
): string {
  let out = '';
  for (const part of template.parts) {
    if (typeof part === 'string' || part.kind === 'var') {
      out += typeof part === 'string' ? part : part.text;
      continue;
    }
    const target = valueFor(part.slot, part.role, part.alpha);
    if (!target) out += part.text;
    else
      out += part.like ? formatLike(target, part.alpha, part.like) : formatCss(target, part.alpha);
  }
  return out;
}

/** The variables a template can read. */
export function templateVars(template: Template): VarUse[] {
  const out = new Map<string, VarUse>();
  for (const part of template.parts) {
    if (typeof part === 'string') continue;
    const use = partVar(part);
    out.set(use.name, use);
  }
  return [...out.values()];
}

export const touches = (template: Template, dirty: ReadonlySet<SlotKey> | undefined): boolean =>
  dirty === undefined || template.slots.some((slot) => dirty.has(slot));
