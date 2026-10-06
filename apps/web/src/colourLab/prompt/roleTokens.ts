import { type Catalogue, type ClassUse, type VarRef } from '../catalogue/types';
import { type Rgb } from '../colour/convert';
import { type RoleKey } from '../model/roles';
import { type ResolveInput, resolveSlot } from '../model/resolve';
import { type SlotKey, slotKind, varNameForSlot } from '../model/slots';
import { type ClassRule, type TextEdit } from './apply/script';
import { SITE_ROLES, UTILITY_PREFIXES, editAt, hex6, isSiteRole, nthOnLine } from './values';

/**
 * A colour that is one thing as text and another as a fill needs two names in the stylesheet, since
 * a class or a `var()` can only say one. Where the lab has set a colour apart in a role, or its dark
 * value differs by role, a new theme colour is made for that role and the places that use the colour
 * in that role are moved to it.
 */
export interface RoleToken {
  slot: SlotKey;
  role: RoleKey;
  /** What follows `--color-`: `rt-ink-fill`. */
  name: string;
  /** The opacities it is used at; 1 stands for none. */
  alphas: number[];
  light: Rgb;
  dark: Rgb | null;
}

export interface ClassMove {
  token: RoleToken;
  rule: ClassRule;
  files: { file: string; expected: number }[];
  /** Every file where this colour is used in this role, at any opacity. */
  seen: string[];
}

export interface RefMove {
  token: RoleToken;
  ref: VarRef;
}

export interface RoleSplit {
  tokens: RoleToken[];
  classes: ClassMove[];
  refs: RefMove[];
}

/** The part of a colour variable after `--color-`: `rt-ink`, `red-600`. */
export function colourName(slot: SlotKey): string | null {
  const name = varNameForSlot(slot);
  return name ? name.slice('--color-'.length) : null;
}

interface Group {
  alphas: number[];
  light: Rgb;
  dark: Rgb | null;
}

const keyOf = (light: Rgb, dark: Rgb | null): string =>
  hex6(light) + '|' + (dark ? hex6(dark) : '');

/** Names for the groups of a role that need a token: the solid one is plain, the others are soft. */
function namesFor(
  base: string,
  role: RoleKey,
  groups: Group[],
  taken: ReadonlySet<string>,
): string[] {
  const highest = Math.max(...groups.flatMap((g) => g.alphas));
  const soft = groups.filter((g) => !g.alphas.includes(highest));
  const names = groups.map((group) => {
    if (group.alphas.includes(highest)) return `${base}-${role}`;
    const index = soft.indexOf(group);
    return index === 0 ? `${base}-${role}-soft` : `${base}-${role}-soft-${index + 1}`;
  });
  // A name the app already uses is not taken over.
  return names.map((name) => (taken.has(name) ? `${name}-lab` : name));
}

/**
 * Works out the role tokens for the colours the app reads by class or by `var()`, for the light
 * theme alone or for both themes. A group of opacities that comes out the same as the colour
 * itself needs nothing. A role that differs in only one of the themes still needs a token,
 * because the other theme's value is then its own.
 */
export function splitByRole(
  catalogue: Catalogue,
  light: ResolveInput,
  dark: ResolveInput | null,
): RoleSplit {
  const classes = new Map<SlotKey, ClassUse[]>();
  const refs = new Map<SlotKey, VarRef[]>();
  for (const use of catalogue.classes) {
    if (!isSiteRole(use.role)) continue;
    classes.set(use.slot, [...(classes.get(use.slot) ?? []), use]);
  }
  for (const ref of catalogue.refs) {
    if (!isSiteRole(ref.role)) continue;
    refs.set(ref.slot, [...(refs.get(ref.slot) ?? []), ref]);
  }

  const taken = new Set(catalogue.tokens.map((t) => t.name.slice('--color-'.length)));
  const result: RoleSplit = { tokens: [], classes: [], refs: [] };
  const slots = [...new Set([...classes.keys(), ...refs.keys()])].filter(
    (s) => slotKind(s) !== 'hex',
  );

  for (const slot of slots.sort()) {
    const base = colourName(slot);
    const baseLight = resolveSlot(slot, 'other', light);
    if (!base || !baseLight) continue;
    const baseDark = dark ? resolveSlot(slot, 'other', dark) : null;
    const baseKey = keyOf(baseLight, baseDark);

    for (const role of SITE_ROLES) {
      const usedClasses = (classes.get(slot) ?? []).filter((use) => use.role === role);
      const usedRefs = (refs.get(slot) ?? []).filter((ref) => ref.role === role);
      const alphas = [
        ...new Set([...usedClasses.map((u) => u.alpha), ...usedRefs.map((r) => r.alpha)]),
      ].sort((a, b) => a - b);
      if (alphas.length === 0) continue;

      const groups = new Map<string, Group>();
      for (const alpha of alphas) {
        const l = resolveSlot(slot, role, light, alpha) ?? baseLight;
        const d = dark ? (resolveSlot(slot, role, dark, alpha) ?? baseDark) : null;
        const key = keyOf(l, d);
        const group = groups.get(key) ?? { alphas: [], light: l, dark: d };
        group.alphas.push(alpha);
        groups.set(key, group);
      }
      const needing = [...groups].filter(([key]) => key !== baseKey).map(([, group]) => group);
      if (needing.length === 0) continue;

      const names = namesFor(base, role, needing, taken);
      needing.forEach((group, index) => {
        const name = names[index] ?? `${base}-${role}`;
        taken.add(name);
        const token: RoleToken = {
          slot,
          role,
          name,
          alphas: group.alphas,
          light: group.light,
          dark: group.dark,
        };
        result.tokens.push(token);

        const inGroup = (alpha: number): boolean =>
          group.alphas.some((a) => Math.abs(a - alpha) < 0.0005);
        const perFile = new Map<string, number>();
        for (const use of usedClasses) {
          if (inGroup(use.alpha)) perFile.set(use.file, (perFile.get(use.file) ?? 0) + use.count);
        }
        if (perFile.size > 0) {
          result.classes.push({
            token,
            rule: { from: base, to: name, prefixes: UTILITY_PREFIXES[role], alphas: group.alphas },
            files: [...perFile]
              .map(([file, expected]) => ({ file, expected }))
              .sort((a, b) => a.file.localeCompare(b.file)),
            seen: [...new Set(usedClasses.map((use) => use.file))].sort(),
          });
        }
        for (const ref of usedRefs) if (inGroup(ref.alpha)) result.refs.push({ token, ref });
      });
    }
  }
  return result;
}

/** The edits that move each `var(--color-…)` reference to its role token. */
export function refEdits(moves: readonly RefMove[], catalogue: Catalogue): TextEdit[] {
  return moves.map(({ token, ref }) => {
    const name = `--color-${colourName(ref.slot)}`;
    return editAt(
      ref,
      [ref.raw],
      ref.raw.replace(name, `--color-${token.name}`),
      nthOnLine(ref, catalogue.refs),
    );
  });
}
