import { describe, expect, it } from 'vitest';

import { type Role } from '../catalogue/types';
import { type Rgb } from '../colour/convert';
import { type SlotKey } from '../model/slots';
import {
  type InspectDeps,
  backgroundBehind,
  inspect,
  labelOf,
  paintsSomething,
  transitionsAround,
} from './inspect';

type Styles = Record<string, string>;

const el = (html: string): Element => {
  const host = document.createElement('div');
  host.innerHTML = html.trim();
  return host.firstElementChild as Element;
};

interface Page {
  styles?: Map<Element, Styles>;
  uses?: Map<Element, { slot: SlotKey; role: Role }[]>;
  colours?: Map<string, Rgb>;
  canvas?: Rgb;
}

/** A page described by hand: what each element computes to, and what paints it. */
const page = ({
  styles = new Map(),
  uses = new Map(),
  colours = new Map(),
  canvas,
}: Page): InspectDeps => ({
  paintOf: (element) => ({ uses: uses.get(element) ?? [], templates: [] }),
  colourOn: (_element, slot, role) => colours.get(slot + '|' + role) ?? null,
  canvas: () => canvas ?? { r: 255, g: 255, b: 255 },
  style: (element) => ({
    getPropertyValue: (name: string) => styles.get(element)?.[name] ?? '',
  }),
});

const INK: Rgb = { r: 8, g: 12, b: 21 };
const GOLD: Rgb = { r: 224, g: 163, b: 60 };
const SECONDARY = 'token:rt-secondary' as SlotKey;
const INK_SLOT = 'token:rt-ink' as SlotKey;

describe('labelOf', () => {
  it('names an element by its tag, id and first three classes', () => {
    expect(labelOf(el('<button id="go" class="a b c d">x</button>'))).toBe('button#go.a.b.c');
    expect(labelOf(el('<p>x</p>'))).toBe('p');
  });

  it('cuts a long label short', () => {
    const long = 'x'.repeat(40) + ' ' + 'y'.repeat(40);
    const label = labelOf(el('<div class="' + long + '"></div>'));
    expect(label.length).toBe(60);
    expect(label.endsWith('…')).toBe(true);
  });
});

describe('backgroundBehind', () => {
  it('is the canvas when nothing is painted', () => {
    const child = el('<div><span></span></div>').firstElementChild as Element;
    expect(backgroundBehind(child, page({ canvas: { r: 18, g: 18, b: 18 } }))).toEqual({
      r: 18,
      g: 18,
      b: 18,
    });
  });

  it('stops at the first solid background', () => {
    const outer = el('<div><section><span></span></section></div>');
    const section = outer.firstElementChild as Element;
    const span = section.firstElementChild as Element;
    const styles = new Map<Element, Styles>([
      [outer, { 'background-color': 'rgb(255, 0, 0)' }],
      [section, { 'background-color': 'rgb(0, 0, 255)' }],
    ]);
    expect(backgroundBehind(span, page({ styles }))).toEqual({ r: 0, g: 0, b: 255 });
  });

  it('lays translucent layers over what is behind them', () => {
    const outer = el('<div><span></span></div>');
    const span = outer.firstElementChild as Element;
    const styles = new Map<Element, Styles>([
      [outer, { 'background-color': 'rgb(0, 0, 0)' }],
      [span, { 'background-color': 'rgba(255, 255, 255, 0.5)' }],
    ]);
    const behind = backgroundBehind(span, page({ styles }));
    expect(behind.r).toBeGreaterThan(120);
    expect(behind.r).toBeLessThan(135);
  });
});

describe('inspect', () => {
  const card = el('<div class="card"><button class="cta">Log in</button></div>');
  const cta = card.firstElementChild as Element;

  const styles = new Map<Element, Styles>([
    [card, { color: 'rgb(8, 12, 21)', 'background-color': 'rgb(255, 255, 255)' }],
    [
      cta,
      {
        color: 'rgb(8, 12, 21)',
        'background-color': 'rgb(224, 163, 60)',
        'border-top-width': '1px',
        'border-top-style': 'solid',
        'border-top-color': 'rgb(224, 163, 60)',
        'box-shadow': 'rgba(8, 12, 21, 0.12) 0px 8px 24px 0px',
      },
    ],
  ]);
  const fillOnly = (colour: Rgb): InspectDeps =>
    page({
      styles,
      uses: new Map([[cta, [{ slot: SECONDARY, role: 'fill' }]]]),
      colours: new Map([[SECONDARY + '|fill', colour]]),
    });

  it('traces the colours of an element to the slots that paint them', () => {
    const deps = page({
      styles,
      uses: new Map([
        [cta, [{ slot: SECONDARY, role: 'fill' }]],
        [card, [{ slot: INK_SLOT, role: 'text' }]],
      ]),
      colours: new Map([
        [SECONDARY + '|fill', GOLD],
        [INK_SLOT + '|text', INK],
      ]),
    });
    const result = inspect(cta, deps);
    const text = result.findings.find((f) => f.role === 'text');
    const fill = result.findings.find((f) => f.role === 'fill');
    // The text colour is inherited, so it is found on the ancestor that sets it.
    expect(text?.slots).toEqual([INK_SLOT]);
    expect(text?.from).toBe(card);
    expect(fill?.slots).toEqual([SECONDARY]);
    expect(fill?.from).toBe(cta);
    expect(result.label).toBe('button.cta');
    expect(result.findings.map((f) => f.role)).toEqual(['text', 'fill', 'border', 'shadow']);
  });

  it('accepts a slot whose colour is a shade off, and refuses one that is not', () => {
    const slotsOfFill = (colour: Rgb) =>
      inspect(cta, fillOnly(colour)).findings.find((f) => f.role === 'fill')?.slots;
    expect(slotsOfFill({ r: 226, g: 161, b: 62 })).toEqual([SECONDARY]);
    expect(slotsOfFill({ r: 200, g: 163, b: 60 })).toEqual([]);
  });

  it('keeps a colour no slot paints, with no slots', () => {
    const result = inspect(cta, page({ styles }));
    expect(result.findings.find((f) => f.role === 'fill')).toMatchObject({
      colour: { r: 224, g: 163, b: 60 },
      slots: [],
    });
  });

  it('scores the text against what is behind it', () => {
    const result = inspect(cta, page({ styles }));
    expect(result.contrast?.ratio).toBeGreaterThan(8);
    expect(result.contrast?.background).toEqual(GOLD);
    expect(result.contrast?.verdict).toBeTruthy();
  });

  it('judges text with some opacity as it looks on the background', () => {
    const faint = new Map(styles);
    faint.set(cta, { ...styles.get(cta), color: 'rgba(8, 12, 21, 0.2)' });
    const solid = inspect(cta, page({ styles })).contrast?.ratio ?? 0;
    expect(inspect(cta, page({ styles: faint })).contrast?.ratio ?? 99).toBeLessThan(solid);
  });

  it('reads an SVG shape by its fill and stroke, and gives it no text contrast', () => {
    const svgNs = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(svgNs, 'svg');
    const rect = document.createElementNS(svgNs, 'rect');
    svg.appendChild(rect);
    const shape = { color: 'rgb(0, 0, 0)', fill: 'rgb(224, 163, 60)', stroke: 'rgb(8, 12, 21)' };
    const result = inspect(rect, page({ styles: new Map([[rect, shape]]) }));
    expect(result.findings.map((f) => f.role)).toEqual(['fill', 'border']);
    expect(result.contrast).toBeNull();
  });

  it('leaves out borders of no width or style, and a shadow of none', () => {
    const plain = el('<div></div>');
    const none: Styles = {
      'border-top-width': '0px',
      'border-top-style': 'solid',
      'border-top-color': 'rgb(1, 2, 3)',
      'border-left-width': '2px',
      'border-left-style': 'none',
      'border-left-color': 'rgb(1, 2, 3)',
      'box-shadow': 'none',
    };
    const result = inspect(plain, page({ styles: new Map([[plain, none]]) }));
    expect(result.findings.filter((f) => f.role === 'border' || f.role === 'shadow')).toEqual([]);
  });
});

describe('transitionsAround', () => {
  const animating = (target: Element, animations: unknown[]): void => {
    Object.defineProperty(target, 'getAnimations', { value: () => animations, configurable: true });
  };
  const transition = (playState: string) => ({ transitionProperty: 'background-color', playState });

  it('finds the transitions running on an element and on what it inherits from', () => {
    const outer = el('<div><span></span></div>');
    const inner = outer.firstElementChild as Element;
    const own = transition('running');
    const inherited = transition('running');
    animating(inner, [own, transition('finished'), { playState: 'running' }]);
    animating(outer, [inherited]);
    expect(transitionsAround(inner)).toEqual([own, inherited]);
  });

  it('is empty when the browser cannot list animations', () => {
    expect(transitionsAround(el('<p></p>'))).toEqual([]);
  });
});

describe('paintsSomething', () => {
  const styled = (styles: Styles) => ({
    getPropertyValue: (name: string) => styles[name] ?? '',
  });
  const clear: Styles = {
    color: 'rgb(8, 12, 21)',
    'background-color': 'rgba(0, 0, 0, 0)',
    'background-image': 'none',
    'box-shadow': 'none',
    opacity: '1',
  };

  it('is false for an element that only catches the pointer', () => {
    expect(paintsSomething(el('<div></div>'), styled(clear))).toBe(false);
    // A colour that is set but has no text to colour.
    expect(paintsSomething(el('<div> </div>'), styled(clear))).toBe(false);
  });

  it('is true for a background colour, a shadow or a border, and not for a gradient', () => {
    const div = el('<div></div>');
    expect(
      paintsSomething(div, styled({ ...clear, 'background-color': 'rgb(224, 163, 60)' })),
    ).toBe(true);
    // Nothing the lab can name, so what is behind it is the colour to pick.
    expect(
      paintsSomething(div, styled({ ...clear, 'background-image': 'linear-gradient(red, blue)' })),
    ).toBe(false);
    expect(
      paintsSomething(div, styled({ ...clear, 'box-shadow': 'rgba(0, 0, 0, 0.1) 0px 1px 2px' })),
    ).toBe(true);
    const bordered = {
      ...clear,
      'border-left-width': '1px',
      'border-left-style': 'solid',
      'border-left-color': 'rgb(56, 60, 71)',
    };
    expect(paintsSomething(div, styled(bordered))).toBe(true);
    expect(paintsSomething(div, styled({ ...bordered, 'border-left-style': 'none' }))).toBe(false);
  });

  it('is true for an element with text of its own, and not for one that only holds an element', () => {
    expect(paintsSomething(el('<p>Hello</p>'), styled(clear))).toBe(true);
    expect(paintsSomething(el('<div><p>Hello</p></div>'), styled(clear))).toBe(false);
    expect(
      paintsSomething(el('<p>Hello</p>'), styled({ ...clear, color: 'rgba(0, 0, 0, 0)' })),
    ).toBe(false);
  });

  it('is true for the elements that show a picture', () => {
    expect(paintsSomething(el('<img alt="" />'), styled(clear))).toBe(true);
    expect(paintsSomething(el('<canvas></canvas>'), styled(clear))).toBe(true);
  });

  it('is false for an element that is not showing', () => {
    expect(paintsSomething(el('<p>Hello</p>'), styled({ ...clear, opacity: '0' }))).toBe(false);
  });

  it('reads an SVG shape by its fill and stroke, and looks through a pattern fill', () => {
    const svgNs = 'http://www.w3.org/2000/svg';
    const rect = document.createElementNS(svgNs, 'rect');
    expect(paintsSomething(rect, styled({ fill: 'rgba(0, 0, 0, 0)', stroke: 'none' }))).toBe(false);
    expect(paintsSomething(rect, styled({ fill: 'rgb(255, 255, 255)', stroke: 'none' }))).toBe(
      true,
    );
    expect(paintsSomething(rect, styled({ fill: 'url("#diagram-grid")', stroke: 'none' }))).toBe(
      false,
    );
    expect(
      paintsSomething(
        rect,
        styled({ fill: 'none', stroke: 'rgb(8, 12, 21)', 'stroke-width': '2px' }),
      ),
    ).toBe(true);
    expect(
      paintsSomething(
        rect,
        styled({ fill: 'none', stroke: 'rgb(8, 12, 21)', 'stroke-width': '0px' }),
      ),
    ).toBe(false);
  });
});
