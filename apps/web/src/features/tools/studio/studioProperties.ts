// Which properties a selection can actually be given.
//
// The properties bar is driven entirely by this: one element shows what it
// supports, a mixed selection shows only the intersection, and applying one
// applies to all of them. Keeping that as a data table rather than a pile of
// conditionals in the toolbar is what makes "what does a stroke and a table
// have in common" answerable — and testable without a canvas.
//
// Two rules decide identity, and both matter:
//
//   * The same property on different kinds is *one* property. A node's fill and
//     a closed path's fill are both `fillColor`, so selecting one of each still
//     offers a fill.
//   * A property that targets something *inside* an element is a different
//     property. A table's cell fill is `cellFill`, not `fillColor`, because
//     applying it paints cells rather than the table.

import type { DiagramEdge, DiagramNode, PathElement, TableElement } from '@roundtable/shared';

import type { StudioInkStroke } from './studioInk';

export type StudioPropertyId =
  'strokeColor' | 'strokeWidth' | 'strokeStyle' | 'fillColor' | 'textFormat' | 'cellFill';

export type StudioPropertyGroup = 'stroke' | 'fill' | 'text' | 'table';

/** What the bar renders for this property. */
export type StudioPropertyControl =
  'strokeSwatch' | 'fillSwatch' | 'widthPreset' | 'stylePreset' | 'textPanel' | 'toggle';

export interface StudioPropertyDescriptor {
  id: StudioPropertyId;
  /** Accessible name; the bar is icon-only, so this is what a screen reader reads. */
  label: string;
  group: StudioPropertyGroup;
  control: StudioPropertyControl;
}

/**
 * Canonical order.
 *
 * The bar always lays properties out in this order and hides the ones the
 * selection does not support, rather than packing whatever is available from
 * the left. A control that moves depending on what is selected can never be
 * found by muscle memory, which is most of what makes a toolbar fast.
 */
const PROPERTY_ORDER: StudioPropertyDescriptor[] = [
  { id: 'fillColor', label: 'Fill', group: 'fill', control: 'fillSwatch' },
  { id: 'cellFill', label: 'Cell fill', group: 'table', control: 'fillSwatch' },
  { id: 'strokeColor', label: 'Line colour', group: 'stroke', control: 'strokeSwatch' },
  { id: 'strokeWidth', label: 'Line width', group: 'stroke', control: 'widthPreset' },
  { id: 'strokeStyle', label: 'Line style', group: 'stroke', control: 'stylePreset' },
  // One control rather than four. Text has enough settings to fill a bar on its
  // own, and they are only wanted while text is actually being worked on.
  { id: 'textFormat', label: 'Format text', group: 'text', control: 'textPanel' },
];

const DESCRIPTOR_BY_ID = new Map(PROPERTY_ORDER.map((entry) => [entry.id, entry]));

export function studioPropertyDescriptor(id: StudioPropertyId): StudioPropertyDescriptor {
  return DESCRIPTOR_BY_ID.get(id)!;
}

/**
 * One selected thing, tagged so the registry can ask about it.
 *
 * A table appears twice over: as an element (grid colour, header row) and, when
 * the selection is inside it, as a set of cells (fill, text). `inCellMode` is
 * what separates the two.
 */
export type StudioTarget =
  | { kind: 'node'; element: DiagramNode }
  | { kind: 'edge'; element: DiagramEdge }
  | { kind: 'ink'; element: StudioInkStroke }
  | { kind: 'path'; element: PathElement }
  | { kind: 'table'; element: TableElement; inCellMode: boolean; cellsHaveText: boolean };

function hasText(value: string | undefined): boolean {
  return Boolean(value && value.trim() !== '');
}

/**
 * The properties this target supports *right now*.
 *
 * Conditional on content, not only on kind: a shape with no label offers no
 * text controls until it has one, and an open path cannot be filled. Both match
 * how the artifact behaves — the write path rejects a fill on an open path — so
 * the bar never offers something that would be refused.
 */
export function propertiesFor(target: StudioTarget): StudioPropertyId[] {
  switch (target.kind) {
    case 'node': {
      // Formatting is offered once there is text to format; an empty shape is
      // typed into by double-pressing it, not by a control.
      const ids: StudioPropertyId[] = ['fillColor', 'strokeColor', 'strokeWidth'];
      if (hasText(target.element.label)) ids.push('textFormat');
      return ids;
    }
    case 'edge': {
      const ids: StudioPropertyId[] = ['strokeColor', 'strokeWidth', 'strokeStyle'];
      if (hasText(target.element.label)) ids.push('textFormat');
      return ids;
    }
    case 'ink':
      // Ink is a mark and nothing else: no fill, no style, no text.
      return ['strokeColor', 'strokeWidth'];
    case 'path': {
      const ids: StudioPropertyId[] = ['strokeColor', 'strokeWidth', 'strokeStyle'];
      // Only a closed path encloses anything to fill.
      if (target.element.closed) ids.unshift('fillColor');
      return ids;
    }
    case 'table':
      // A table is offered text formatting whether or not any cell has been
      // filled in: the settings apply to every cell, so they are as useful
      // before typing as after.
      return target.inCellMode
        ? ['cellFill', 'strokeColor', 'strokeWidth', 'textFormat']
        : ['strokeColor', 'strokeWidth', 'textFormat'];
  }
}

/**
 * What a whole selection can be given, in canonical order.
 *
 * The intersection, so every control shown applies to everything selected and
 * pressing one is never a partial action. An empty result is meaningful: the
 * caller falls back to the alignment tools, which need nothing in common.
 */
export function commonProperties(targets: readonly StudioTarget[]): StudioPropertyDescriptor[] {
  if (targets.length === 0) return [];

  const first = targets[0]!;
  let shared = new Set<StudioPropertyId>(propertiesFor(first));
  for (const target of targets.slice(1)) {
    const supported = new Set(propertiesFor(target));
    shared = new Set([...shared].filter((id) => supported.has(id)));
    if (shared.size === 0) break;
  }

  return PROPERTY_ORDER.filter((descriptor) => shared.has(descriptor.id));
}

/** Group the bar's contents, so related controls can sit together. */
export function groupProperties(
  descriptors: readonly StudioPropertyDescriptor[],
): { group: StudioPropertyGroup; properties: StudioPropertyDescriptor[] }[] {
  const groups: { group: StudioPropertyGroup; properties: StudioPropertyDescriptor[] }[] = [];
  for (const descriptor of descriptors) {
    const last = groups.at(-1);
    if (last && last.group === descriptor.group) last.properties.push(descriptor);
    else groups.push({ group: descriptor.group, properties: [descriptor] });
  }
  return groups;
}
