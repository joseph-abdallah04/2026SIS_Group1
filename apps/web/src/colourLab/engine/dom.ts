import { roleOfProperty } from '../catalogue/roles';
import { SVG_COLOUR_ATTRIBUTES } from '../catalogue/scanSvg';
import { splitDeclarations } from '../colour/tokens';
import { type SlotKey } from '../model/slots';
import { type Painter, type Template, buildTemplate, renderTemplate, touches } from './template';

/** Attributes whose change can mean a colour changed. */
export const COLOUR_ATTRIBUTES: ReadonlySet<string> = new Set([...SVG_COLOUR_ATTRIBUTES, 'style']);

const CANDIDATES = [...COLOUR_ATTRIBUTES].map((name) => `[${name}]`).join(',');

/** A cheap test that a value might hold a colour, so most inline styles cost nothing to skip. */
const MAY_HOLD_COLOUR = /#[0-9a-f]{3}|rgb|hsl|oklch|oklab|--color-/i;

/** What the lab writes in place of a colour. A value that has it is the lab's own. */
const OURS = '--cl-';

interface Entry {
  kind: 'style' | 'attribute';
  name: string;
  important: boolean;
  template: Template;
  /** What the page last held, written by us or by the app. */
  last: string;
}

/**
 * The colours the app writes into elements itself: inline styles and SVG
 * presentation attributes. These cannot be reached through a stylesheet, and
 * hold much of the palette: the sticky papers, the avatar swatches, every
 * colour a diagram is drawn in.
 *
 * Each value the app sets is remembered as the original. What this wrote is
 * remembered too, so that the app setting a value again, which is what a
 * re-render does, is told apart from this seeing its own change.
 */
export class DomEngine {
  private readonly entries = new WeakMap<Element, Map<string, Entry>>();
  private readonly tracked = new Set<Element>();

  constructor(private readonly onTemplate: (template: Template) => void) {}

  /** Reads an element and everything under it. */
  scan(root: Element, painter: Painter): void {
    this.track(root, painter);
    for (const element of Array.from(root.querySelectorAll(CANDIDATES))) {
      this.track(element, painter);
    }
  }

  /** Reads one element, again if it has changed. */
  track(element: Element, painter: Painter): void {
    const known = this.entries.get(element) ?? new Map<string, Entry>();
    const found: Entry[] = [];

    if (element instanceof HTMLElement || element instanceof SVGElement) {
      const style = element.style;
      if (element.hasAttribute('style') && style.length > 0) {
        const seen = new Set<string>();
        for (const declaration of splitDeclarations(style.cssText)) {
          if (!MAY_HOLD_COLOUR.test(declaration.value)) continue;
          const key = `style:${declaration.name}`;
          seen.add(key);
          const entry = this.reread(known, key, declaration.value, {
            kind: 'style',
            name: declaration.name,
            important: declaration.important,
          });
          if (entry) found.push(entry);
        }
        for (const key of [...known.keys()]) {
          if (key.startsWith('style:') && !seen.has(key)) known.delete(key);
        }
      } else {
        for (const key of [...known.keys()]) if (key.startsWith('style:')) known.delete(key);
      }
    }

    for (const name of SVG_COLOUR_ATTRIBUTES) {
      const value = element.getAttribute(name);
      const key = `attribute:${name}`;
      if (value === null || !MAY_HOLD_COLOUR.test(value)) {
        known.delete(key);
        continue;
      }
      const entry = this.reread(known, key, value, { kind: 'attribute', name, important: false });
      if (entry) found.push(entry);
    }

    if (known.size === 0) {
      this.entries.delete(element);
      this.tracked.delete(element);
      return;
    }
    this.entries.set(element, known);
    this.tracked.add(element);
    for (const entry of found) {
      this.onTemplate(entry.template);
      this.write(element, entry, painter);
    }
  }

  /** Writes current colours into every tracked element a changed slot touches. */
  reapply(painter: Painter, dirty: ReadonlySet<SlotKey>): void {
    for (const element of this.tracked) {
      if (!element.isConnected) {
        this.tracked.delete(element);
        continue;
      }
      for (const entry of this.entries.get(element)?.values() ?? []) {
        if (touches(entry.template, dirty)) this.write(element, entry, painter);
      }
    }
  }

  /** How many connected elements use each slot. */
  counts(): Map<SlotKey, number> {
    const counts = new Map<SlotKey, number>();
    for (const element of this.tracked) {
      if (!element.isConnected) {
        this.tracked.delete(element);
        continue;
      }
      const slots = new Set<SlotKey>();
      for (const entry of this.entries.get(element)?.values() ?? []) {
        for (const slot of entry.template.slots) slots.add(slot);
      }
      for (const slot of slots) counts.set(slot, (counts.get(slot) ?? 0) + 1);
    }
    return counts;
  }

  elementsFor(slot: SlotKey, limit: number): Element[] {
    const found: Element[] = [];
    for (const element of this.tracked) {
      if (found.length >= limit) break;
      if (!element.isConnected) continue;
      for (const entry of this.entries.get(element)?.values() ?? []) {
        if (entry.template.slots.includes(slot)) {
          found.push(element);
          break;
        }
      }
    }
    return found;
  }

  /** The templates an element's colours are made of, for working out what paints it. */
  templatesOf(element: Element): Template[] {
    return [...(this.entries.get(element)?.values() ?? [])].map((entry) => entry.template);
  }

  /**
   * The entry for a value, or `null` if it is one this wrote and nothing is
   * new. A value that is not what this last held is the app's, and becomes
   * the new original.
   */
  private reread(
    known: Map<string, Entry>,
    key: string,
    value: string,
    describe: Pick<Entry, 'kind' | 'name' | 'important'>,
  ): Entry | null {
    const existing = known.get(key);
    if (existing && existing.last === value) return null;
    // Said in the lab's own words, and not the app's: leave what it is standing in for.
    if (existing && value.includes(OURS)) return null;
    const template = buildTemplate(value, roleOfProperty(describe.name), describe.name);
    if (!template) {
      known.delete(key);
      return null;
    }
    const entry: Entry = { ...describe, template, last: value };
    known.set(key, entry);
    return entry;
  }

  private write(element: Element, entry: Entry, painter: Painter): void {
    const next = renderTemplate(entry.template, painter);
    if (next === entry.last) return;
    if (entry.kind === 'attribute') {
      element.setAttribute(entry.name, next);
      entry.last = next;
      return;
    }
    const style = (element as HTMLElement).style;
    style.setProperty(entry.name, next, entry.important ? 'important' : '');
    // Read back what the browser made of it. It reserialises, and a later read
    // of the element has to be recognised as ours rather than the app's.
    entry.last = style.getPropertyValue(entry.name) || next;
  }
}
