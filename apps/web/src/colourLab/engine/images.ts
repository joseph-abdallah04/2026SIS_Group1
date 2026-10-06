import { findSvgColours } from '../catalogue/scanSvg';
import { type Role } from '../catalogue/types';
import { type Rgb } from '../colour/convert';
import { type SlotKey, hexSlotKey } from '../model/slots';
import { type Part, type Template, renderValues, touches } from './template';

/** What a colour in an image should be: `null` leaves it as the file has it. */
export type ValueFn = (slot: SlotKey, role: Role, alpha: number) => Rgb | null;

/** A colour in an SVG file, as a template over the whole file's text. */
export function buildSvgTemplate(svg: string): Template | null {
  const spans = findSvgColours(svg).filter((span) => span.alpha > 0);
  if (spans.length === 0) return null;
  const parts: Part[] = [];
  const slots = new Set<SlotKey>();
  let last = 0;
  for (const span of spans) {
    if (span.start > last) parts.push(svg.slice(last, span.start));
    const slot = hexSlotKey(span.rgb);
    slots.add(slot);
    parts.push({
      kind: 'colour',
      text: span.text,
      slot,
      alpha: span.alpha,
      like: span.like,
      role: 'image',
    });
    last = span.end;
  }
  if (last < svg.length) parts.push(svg.slice(last));
  return { original: svg, parts, slots: [...slots] };
}

export const isSvgSource = (src: string): boolean =>
  /^data:image\/svg\+xml/i.test(src) || /\.svg(?:[?#]|$)/i.test(src);

export const toSvgDataUrl = (svg: string): string =>
  `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

/** The text of an SVG data URL, in any of the encodings one comes in. */
export function readSvgDataUrl(src: string): string | null {
  const comma = src.indexOf(',');
  if (comma === -1) return null;
  const header = src.slice(0, comma);
  const body = src.slice(comma + 1);
  try {
    if (/;base64/i.test(header)) {
      const binary = atob(body);
      return new TextDecoder().decode(Uint8Array.from(binary, (ch) => ch.charCodeAt(0)));
    }
    return decodeURIComponent(body);
  } catch {
    return body;
  }
}

async function readSvgSource(src: string): Promise<string | null> {
  if (src.startsWith('data:')) return readSvgDataUrl(src);
  try {
    const response = await fetch(src);
    return response.ok ? await response.text() : null;
  } catch {
    return null;
  }
}

interface ImageState {
  /** The `src` the app set. */
  original: string;
  /** The data URL this swapped in, or `null` while the original is showing. */
  written: string | null;
  template: Template | null;
}

/**
 * SVGs shown through `<img>`: the logo, and every stored drawing, whose colours
 * are baked into the file. A stylesheet cannot reach inside an image, so the
 * file is read, its colours swapped, and the image given the result as a data
 * URL. Put back by giving it the original `src` again.
 *
 * Which colours an image gets is up to `valueFor`, asked per image, since a
 * drawing on a card is paper and keeps the light theme's colours in the dark.
 */
export class ImageEngine {
  private readonly states = new WeakMap<HTMLImageElement, ImageState>();
  private readonly tracked = new Set<HTMLImageElement>();
  private readonly templates = new Map<string, Promise<Template | null>>();

  constructor(
    private readonly valueFor: (image: HTMLImageElement) => ValueFn,
    private readonly onTemplate: (template: Template) => void,
  ) {}

  scan(root: Element): void {
    if (root instanceof HTMLImageElement) this.track(root);
    for (const image of Array.from(root.querySelectorAll('img'))) this.track(image);
  }

  track(image: HTMLImageElement): void {
    const src = image.getAttribute('src') ?? '';
    const state = this.states.get(image);
    if (state && (src === state.original || src === state.written)) return;
    if (!isSvgSource(src)) {
      this.states.delete(image);
      this.tracked.delete(image);
      return;
    }
    const fresh: ImageState = { original: src, written: null, template: null };
    this.states.set(image, fresh);
    this.tracked.add(image);
    void this.templateFor(src).then((template) => {
      if (this.states.get(image) !== fresh || !template) return;
      fresh.template = template;
      this.onTemplate(template);
      this.write(image, fresh);
    });
  }

  reapply(dirty: ReadonlySet<SlotKey>): void {
    for (const image of this.tracked) {
      if (!image.isConnected) {
        this.tracked.delete(image);
        continue;
      }
      const state = this.states.get(image);
      if (state?.template && touches(state.template, dirty)) this.write(image, state);
    }
  }

  counts(): Map<SlotKey, number> {
    const counts = new Map<SlotKey, number>();
    for (const image of this.tracked) {
      if (!image.isConnected) {
        this.tracked.delete(image);
        continue;
      }
      for (const slot of this.states.get(image)?.template?.slots ?? []) {
        counts.set(slot, (counts.get(slot) ?? 0) + 1);
      }
    }
    return counts;
  }

  elementsFor(slot: SlotKey, limit: number): Element[] {
    const found: Element[] = [];
    for (const image of this.tracked) {
      if (found.length >= limit) break;
      if (image.isConnected && this.states.get(image)?.template?.slots.includes(slot)) {
        found.push(image);
      }
    }
    return found;
  }

  private templateFor(src: string): Promise<Template | null> {
    let template = this.templates.get(src);
    if (!template) {
      template = readSvgSource(src).then((svg) => (svg ? buildSvgTemplate(svg) : null));
      this.templates.set(src, template);
      // A drawing is stored by its content, so one that changes is a new key; keep the cache small.
      if (this.templates.size > 200) {
        const oldest = this.templates.keys().next().value;
        if (oldest !== undefined) this.templates.delete(oldest);
      }
    }
    return template;
  }

  private write(image: HTMLImageElement, state: ImageState): void {
    if (!state.template) return;
    const rendered = renderValues(state.template, this.valueFor(image));
    const target = rendered === state.template.original ? state.original : toSvgDataUrl(rendered);
    if (target === (state.written ?? state.original)) return;
    state.written = target === state.original ? null : target;
    image.setAttribute('src', target);
  }
}
