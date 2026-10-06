import { type Role } from '../catalogue/types';
import { contrastRatio, contrastVerdict, compositeOver } from '../colour/contrast';
import { type Rgb } from '../colour/convert';
import { type Rgba, parseColour } from '../colour/parse';
import { findColourTokens } from '../colour/tokens';
import { type RoleKey } from '../model/roles';
import { type SlotKey } from '../model/slots';
import { type Template } from '../engine/template';

/** One way an element is painted, and what paints it. */
export interface Finding {
  role: RoleKey;
  /** What the browser says the colour is. */
  colour: Rgba;
  /** The slots that paint it, the likeliest first. Empty if it cannot be traced to one. */
  slots: SlotKey[];
  /** The element the colour was found on: text colour and backgrounds are inherited. */
  from: Element;
}

export interface Contrast {
  ratio: number;
  verdict: ReturnType<typeof contrastVerdict>;
  foreground: Rgb;
  background: Rgb;
}

export interface Inspection {
  element: Element;
  label: string;
  findings: Finding[];
  /** The element's text against what is behind it. `null` if it has no text colour to judge. */
  contrast: Contrast | null;
}

/** What the inspector needs to know about the page, so it can be tried without one. */
export interface InspectDeps {
  /** The rules and inline colours that apply to an element, by the slot and role they paint. */
  paintOf(element: Element): {
    uses: readonly { slot: SlotKey; role: Role }[];
    templates: Template[];
  };
  /** The colour a slot is in a role for an element right now. */
  colourOn(element: Element, slot: SlotKey, role: Role, alpha: number): Rgb | null;
  /** The colour behind the whole page. */
  canvas(): Rgb;
  style(element: Element): Pick<CSSStyleDeclaration, 'getPropertyValue'>;
}

const BORDER_SIDES = ['top', 'right', 'bottom', 'left'] as const;
/** How far apart two colours may be, per channel, and still be the same one. */
const TOLERANCE = 3;

const closeEnough = (a: Rgb, b: Rgb): boolean =>
  Math.abs(a.r - b.r) <= TOLERANCE &&
  Math.abs(a.g - b.g) <= TOLERANCE &&
  Math.abs(a.b - b.b) <= TOLERANCE;

/** A short name for an element: its tag, id and the first few classes. */
export function labelOf(element: Element): string {
  const classes = [...element.classList].slice(0, 3).join('.');
  const id = element.id ? `#${element.id}` : '';
  const text = `${element.tagName.toLowerCase()}${id}${classes ? `.${classes}` : ''}`;
  return text.length > 60 ? `${text.slice(0, 59)}…` : text;
}

function colourOfValue(value: string): Rgba | null {
  return parseColour(value)?.rgba ?? null;
}

/** Which slots, among those that paint an element in a role, are the colour the browser reports. */
function slotsFor(element: Element, role: RoleKey, target: Rgba, deps: InspectDeps): SlotKey[] {
  const { uses, templates } = deps.paintOf(element);
  const candidates = new Set<SlotKey>();
  for (const use of uses) if (use.role === role) candidates.add(use.slot);
  for (const template of templates) {
    for (const part of template.parts) {
      if (typeof part !== 'string' && part.role === role) candidates.add(part.slot);
    }
  }
  return [...candidates].filter((slot) => {
    const colour = deps.colourOn(element, slot, role, target.a);
    return colour !== null && closeEnough(colour, target);
  });
}

/** What an element is painted with behind its own content: backgrounds stack until one is solid. */
export function backgroundBehind(element: Element, deps: InspectDeps): Rgb {
  const layers: Rgba[] = [];
  for (let el: Element | null = element; el; el = el.parentElement) {
    const colour = colourOfValue(deps.style(el).getPropertyValue('background-color'));
    if (!colour || colour.a === 0) continue;
    layers.push(colour);
    if (colour.a >= 1) break;
  }
  let behind: Rgb = deps.canvas();
  for (const layer of layers.reverse()) behind = compositeOver(layer, layer.a, behind);
  return behind;
}

/**
 * Works out what an element is painted with: its text, its background, its
 * border and its shadow, each traced back to the colour of the lab that makes
 * it, and how well its text reads on what is behind it.
 *
 * The browser only says what a colour has come out as. To say what made it,
 * every rule and inline colour that applies to the element is asked what colour
 * it is now, and the one that matches is the one that painted it. Text and
 * backgrounds are looked for up the tree, since they are inherited or sit on a
 * parent.
 */
export function inspect(element: Element, deps: InspectDeps): Inspection {
  const style = deps.style(element);
  const findings: Finding[] = [];

  // Text: the colour is inherited, so the rule that set it may be on an ancestor.
  const text = colourOfValue(style.getPropertyValue('color'));
  const isSvgShape = element instanceof SVGElement && element.tagName.toLowerCase() !== 'svg';
  if (text && text.a > 0 && !isSvgShape) {
    let from: Element = element;
    let slots: SlotKey[] = [];
    for (let el: Element | null = element; el; el = el.parentElement) {
      slots = slotsFor(el, 'text', text, deps);
      if (slots.length > 0) {
        from = el;
        break;
      }
    }
    findings.push({ role: 'text', colour: text, slots, from });
  }

  // Fill: the nearest background that shows, or an SVG shape's own fill.
  if (isSvgShape) {
    const fill = colourOfValue(style.getPropertyValue('fill'));
    if (fill && fill.a > 0) {
      findings.push({
        role: 'fill',
        colour: fill,
        slots: slotsFor(element, 'fill', fill, deps),
        from: element,
      });
    }
    const stroke = colourOfValue(style.getPropertyValue('stroke'));
    if (stroke && stroke.a > 0) {
      findings.push({
        role: 'border',
        colour: stroke,
        slots: slotsFor(element, 'border', stroke, deps),
        from: element,
      });
    }
  } else {
    for (let el: Element | null = element; el; el = el.parentElement) {
      const fill = colourOfValue(deps.style(el).getPropertyValue('background-color'));
      if (!fill || fill.a === 0) continue;
      findings.push({
        role: 'fill',
        colour: fill,
        slots: slotsFor(el, 'fill', fill, deps),
        from: el,
      });
      break;
    }

    for (const side of BORDER_SIDES) {
      const width = parseFloat(style.getPropertyValue(`border-${side}-width`));
      const kind = style.getPropertyValue(`border-${side}-style`);
      const colour = colourOfValue(style.getPropertyValue(`border-${side}-color`));
      if (width > 0 && kind !== 'none' && colour && colour.a > 0) {
        findings.push({
          role: 'border',
          colour,
          slots: slotsFor(element, 'border', colour, deps),
          from: element,
        });
        break;
      }
    }
  }

  const shadow = style.getPropertyValue('box-shadow');
  if (shadow && shadow !== 'none') {
    const token = findColourTokens(shadow).find((t) => t.colour.rgba.a > 0);
    if (token) {
      findings.push({
        role: 'shadow',
        colour: token.colour.rgba,
        slots: slotsFor(element, 'shadow', token.colour.rgba, deps),
        from: element,
      });
    }
  }

  let contrast: Contrast | null = null;
  if (text && text.a > 0 && !isSvgShape) {
    const background = backgroundBehind(element, deps);
    const foreground = text.a < 1 ? compositeOver(text, text.a, background) : text;
    const ratio = contrastRatio(foreground, background);
    contrast = { ratio, verdict: contrastVerdict(ratio), foreground, background };
  }

  return { element, label: labelOf(element), findings, contrast };
}

/**
 * Transitions still running on an element or anything it inherits from. While one runs, the
 * browser reports a colour part-way between the old and the new, which no slot can match, so
 * the inspector waits for them and reads the element again.
 */
export function transitionsAround(element: Element): Animation[] {
  const running: Animation[] = [];
  for (let node: Element | null = element; node; node = node.parentElement) {
    if (typeof node.getAnimations !== 'function') return running;
    for (const animation of node.getAnimations()) {
      if ('transitionProperty' in animation && animation.playState === 'running') {
        running.push(animation);
      }
    }
  }
  return running;
}

/** Elements that show a picture or a frame of their own, which the lab cannot read colours from. */
const SHOWS_CONTENT = new Set(['img', 'video', 'canvas', 'picture', 'iframe', 'object', 'embed']);

/** A computed flat colour that is something to see. A gradient or a `url()` pattern is not one. */
function isVisible(value: string): boolean {
  const colour = colourOfValue(value.trim());
  return colour !== null && colour.a > 0;
}

/**
 * Whether an element paints anything of its own that the lab can name: text, a
 * background colour, a border, a shadow, or an SVG fill or stroke. A gradient or
 * a pattern is not one, so a picture of dots over a sheet leaves the sheet to be picked. A page is full of elements that paint nothing
 * and only catch the pointer, such as an overlay for dragging, and a person
 * pointing at a colour means the one they can see, not the overlay in front of it.
 */
export function paintsSomething(
  element: Element,
  style: Pick<CSSStyleDeclaration, 'getPropertyValue'>,
): boolean {
  if (SHOWS_CONTENT.has(element.localName)) return true;
  if (parseFloat(style.getPropertyValue('opacity') || '1') === 0) return false;

  if (element instanceof SVGElement && element.localName !== 'svg') {
    if (isVisible(style.getPropertyValue('fill'))) return true;
    const stroked = parseFloat(style.getPropertyValue('stroke-width') || '1') > 0;
    return stroked && isVisible(style.getPropertyValue('stroke'));
  }

  const hasText = [...element.childNodes].some(
    (node) => node.nodeType === Node.TEXT_NODE && (node.textContent ?? '').trim() !== '',
  );
  if (hasText && isVisible(style.getPropertyValue('color'))) return true;
  if (isVisible(style.getPropertyValue('background-color'))) return true;
  const shadow = style.getPropertyValue('box-shadow');
  if (shadow !== '' && shadow !== 'none') return true;
  return BORDER_SIDES.some(
    (side) =>
      parseFloat(style.getPropertyValue(`border-${side}-width`)) > 0 &&
      style.getPropertyValue(`border-${side}-style`) !== 'none' &&
      isVisible(style.getPropertyValue(`border-${side}-color`)),
  );
}
