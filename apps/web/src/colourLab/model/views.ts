import { type Catalogue, type LiteralOccurrence, type Role } from '../catalogue/types';
import { type Rgb } from '../colour/convert';
import { toHex } from '../colour/parse';
import { labelForSlot } from './brand';
import {
  type ResolveInput,
  type Scheme,
  type SchemeEdits,
  type SlotEdit,
  changedRoles,
  defaultColour,
  originalOf,
  resolveSlot,
  sameColour,
} from './resolve';
import { ROLE_KEYS, type RoleKey } from './roles';
import { type SlotKey, slotKind } from './slots';
import { type Filter } from './store';

export type Group = 'brand' | 'tailwind' | 'hardcoded';

export const GROUP_TITLES: Record<Group, string> = {
  brand: 'Brand colours',
  tailwind: 'Tailwind colours',
  hardcoded: 'Hardcoded colours',
};

/** One role of a colour: what it is, and what it would be with no edits. */
export interface RoleColour {
  current: Rgb;
  baseline: Rgb;
  /** Whether this role has a setting of its own, apart from the colour overall. */
  own: boolean;
}

export interface SlotView {
  key: SlotKey;
  group: Group;
  label: string;
  hint: string;
  /** The colour wherever it is used, in the theme being shown. */
  current: Rgb;
  /** What that would be with nothing set by the user in this theme. */
  baseline: Rgb;
  /** The app's own colour, as shipped. */
  original: Rgb;
  changed: boolean;
  /** What the user has set for it in this theme, if anything. */
  own: SlotEdit | null;
  /** The roles it is used in, with the colour each has. */
  roles: Partial<Record<RoleKey, RoleColour>>;
  /** Some role is not the colour overall. */
  split: boolean;
  /** The slot it starts out following, and whether it is following it now. */
  link: { target: SlotKey; label: string; following: boolean } | null;
  onPage: boolean;
  pageCount: number;
  /** Places in the source that use it. */
  sites: number;
  /** A few recognisable places, for the second line of its row. */
  where: string[];
  exportOnly: boolean;
}

export interface ViewInputs {
  catalogue: Catalogue;
  scheme: Scheme;
  originals: ReadonlyMap<SlotKey, Rgb>;
  defaultLinks: ReadonlyMap<SlotKey, SlotKey>;
  liveHex: ReadonlySet<SlotKey>;
  usage: ReadonlyMap<SlotKey, number>;
  /** The roles the page's stylesheets use each slot in. */
  roleUse: ReadonlyMap<SlotKey, ReadonlySet<Role>>;
  usageKnown: boolean;
  edits: SchemeEdits;
}

const basename = (file: string): string => file.slice(file.lastIndexOf('/') + 1);

/** The most common few, most common first. */
function topBy<T>(items: readonly T[], key: (item: T) => string, limit: number): string[] {
  const counts = new Map<string, number>();
  for (const item of items) {
    const name = key(item);
    if (name) counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  return [...counts]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([name]) => name);
}

const shorten = (text: string, length = 46): string =>
  text.length > length ? `${text.slice(0, length - 1)}…` : text;

/** Tailwind shades in numeric order, so red-50 comes before red-600. */
function compareTailwind(a: SlotKey, b: SlotKey): number {
  const order = (key: SlotKey): [string, number] => {
    const [family = '', shade = '0'] = key.slice(key.indexOf(':') + 1).split('-');
    return [family, parseInt(shade, 10) || 0];
  };
  const [fa, sa] = order(a);
  const [fb, sb] = order(b);
  return fa === fb ? sa - sb : fa.localeCompare(fb);
}

/** Everything the list shows, one row per slot. */
export function buildSlotViews(inputs: ViewInputs): SlotView[] {
  const { catalogue, scheme, originals, defaultLinks, liveHex, usage, roleUse, edits } = inputs;
  const input: ResolveInput = { scheme, originals, defaultLinks, edits };

  const literals = new Map<SlotKey, LiteralOccurrence[]>();
  for (const literal of catalogue.literals) {
    const list = literals.get(literal.slot) ?? [];
    list.push(literal);
    literals.set(literal.slot, list);
  }
  const classUses = new Map<SlotKey, { count: number; files: string[]; roles: Set<Role> }>();
  for (const use of catalogue.classes) {
    const entry = classUses.get(use.slot) ?? { count: 0, files: [], roles: new Set<Role>() };
    entry.count += use.count;
    entry.roles.add(use.role);
    entry.files.push(...Array<string>(Math.min(use.count, 50)).fill(basename(use.file)));
    classUses.set(use.slot, entry);
  }

  const brand = new Set<SlotKey>(catalogue.tokens.map((token) => token.slot));
  const tailwind = new Set<SlotKey>();
  for (const slot of originals.keys()) (slotKind(slot) === 'token' ? brand : tailwind).add(slot);
  const hardcoded = new Set<SlotKey>([...literals.keys(), ...liveHex]);

  const build = (slot: SlotKey, group: Group): SlotView | null => {
    const original = originalOf(slot, input);
    if (!original) return null;
    const current = resolveSlot(slot, 'other', input) ?? original;
    const baseline = defaultColour(slot, 'other', input) ?? original;
    const label = labelForSlot(slot);
    const own = edits[slot] ?? null;
    const target = defaultLinks.get(slot);
    const sites = literals.get(slot) ?? [];
    const classes = classUses.get(slot);

    const used = new Set<Role>([
      ...(roleUse.get(slot) ?? []),
      ...sites.map((literal) => literal.role),
      ...(classes?.roles ?? []),
    ]);
    const roles: Partial<Record<RoleKey, RoleColour>> = {};
    let split = false;
    for (const role of ROLE_KEYS) {
      if (!used.has(role)) continue;
      const roleCurrent = resolveSlot(slot, role, input) ?? original;
      roles[role] = {
        current: roleCurrent,
        baseline: defaultColour(slot, role, input) ?? original,
        own: own?.roles?.[role] !== undefined,
      };
      if (!sameColour(roleCurrent, current)) split = true;
    }

    return {
      key: slot,
      group,
      label: label.label,
      hint: label.hint,
      current,
      baseline,
      original,
      changed: changedRoles(slot, input).length > 0,
      own,
      roles,
      split,
      link: target
        ? { target, label: labelForSlot(target).label, following: own?.base === undefined }
        : null,
      onPage: (usage.get(slot) ?? 0) > 0,
      pageCount: usage.get(slot) ?? 0,
      sites: sites.length + (classes?.count ?? 0),
      where:
        group === 'hardcoded'
          ? topBy(sites, (literal) => literal.context, 3).map((context) => shorten(context))
          : topBy(classes?.files ?? [], (file) => file, 3),
      exportOnly: sites.length > 0 && !classes && sites.every((literal) => literal.exportOnly),
    };
  };

  const views: SlotView[] = [];
  const add = (slots: Iterable<SlotKey>, group: Group): void => {
    for (const slot of slots) {
      const view = build(slot, group);
      if (view) views.push(view);
    }
  };

  add(brand, 'brand');
  add([...tailwind].sort(compareTailwind), 'tailwind');
  add(
    [...hardcoded].sort(
      (a, b) =>
        (literals.get(b)?.length ?? 0) - (literals.get(a)?.length ?? 0) || a.localeCompare(b),
    ),
    'hardcoded',
  );
  return views;
}

export interface Listing {
  views: SlotView[];
  /** The page has not been checked yet, so "this page" is showing everything. */
  pending: boolean;
}

/** Narrows the rows to the filter and the search box. */
export function filterViews(
  views: readonly SlotView[],
  filter: Filter,
  search: string,
  usageKnown: boolean,
): Listing {
  const needle = search.trim().toLowerCase();
  const pending = filter === 'page' && !usageKnown;
  const kept = views.filter((view) => {
    if (filter === 'page' && usageKnown && !view.onPage) return false;
    if (filter === 'changed' && !view.changed && view.own === null) return false;
    if (!needle) return true;
    const haystack = [
      view.label,
      view.hint,
      view.key,
      toHex(view.original),
      toHex(view.current),
      view.link?.label ?? '',
      ...view.where,
    ]
      .join(' ')
      .toLowerCase();
    return haystack.includes(needle);
  });
  return { views: kept, pending };
}
