import { beforeEach, describe, expect, it } from 'vitest';

import { type SlotKey } from '../model/slots';
import { DomEngine } from './dom';
import { type Painter, type Template } from './template';

/** A painter that reads the variable for the given slots, in any role. */
const reading = (...slots: SlotKey[]): Painter => ({ reads: (slot) => slots.includes(slot) });
const never: Painter = { reads: () => false };

let templates: Template[];
let engine: DomEngine;

beforeEach(() => {
  document.body.innerHTML = '';
  templates = [];
  engine = new DomEngine((template) => templates.push(template));
});

const slotsSeen = () => templates.flatMap((template) => template.slots).sort();

function add(html: string): HTMLElement {
  const holder = document.createElement('div');
  holder.innerHTML = html;
  const element = holder.firstElementChild as HTMLElement;
  document.body.appendChild(holder);
  return element;
}

describe('DomEngine: inline styles', () => {
  it('reports the colours an element sets for itself', () => {
    const el = add('<div style="background: #FDF4E5; color: #080C15"></div>');
    engine.track(el, never);
    expect(slotsSeen()).toEqual(['hex:#080c15', 'hex:#fdf4e5']);
  });

  it('leaves an element exactly as it was while nothing is read', () => {
    const el = add('<div style="background: #FDF4E5"></div>');
    const before = el.getAttribute('style');
    engine.track(el, never);
    expect(el.getAttribute('style')).toBe(before);
  });

  it('points a colour at its variable, the colour it was as the fallback', () => {
    const el = add('<div style="background: #FDF4E5; color: #080C15"></div>');
    engine.track(el, reading('hex:#fdf4e5'));
    const style = el.getAttribute('style') ?? '';
    expect(style).toContain('var(--cl-fill-hex-fdf4e5');
    expect(style).toMatch(/color: rgb\(8, 12, 21\)/);
  });

  it('puts the original back when the colour is no longer read', () => {
    const el = add('<div style="background: #FDF4E5"></div>');
    engine.track(el, reading('hex:#fdf4e5'));
    engine.reapply(never, new Set(['hex:#fdf4e5']));
    expect(el.style.backgroundColor).toBe('rgb(253, 244, 229)');
  });

  it('only touches elements that use a slot that changed', () => {
    const a = add('<div style="color: #FF0000"></div>');
    const b = add('<div style="color: #0000FF"></div>');
    engine.track(a, never);
    engine.track(b, never);
    engine.reapply(reading('hex:#0000ff'), new Set(['hex:#0000ff']));
    expect(a.getAttribute('style')).not.toContain('--cl-');
    expect(b.getAttribute('style')).toContain('--cl-text-hex-0000ff');
  });

  it('keeps the alpha of a see-through colour, in the variable it reads', () => {
    const el = add('<div style="box-shadow: 0 1px 2px rgba(8, 12, 21, 0.12)"></div>');
    engine.track(el, reading('hex:#080c15'));
    expect(el.getAttribute('style')).toContain('var(--cl-shadow-hex-080c15-120');
  });

  it('reads a custom property the app keeps a colour in', () => {
    const el = add('<div style="--rt-control-fill: #F4F6F7"></div>');
    engine.track(el, reading('hex:#f4f6f7'));
    expect(el.style.getPropertyValue('--rt-control-fill')).toBe(
      'var(--cl-fill-hex-f4f6f7, #F4F6F7)',
    );
  });

  it('reads a brand token the app names in an inline style', () => {
    const el = add('<div style="background: var(--color-rt-tertiary)"></div>');
    engine.track(el, reading('token:rt-tertiary'));
    expect(el.getAttribute('style')).toContain(
      'var(--cl-fill-token-rt-tertiary, var(--color-rt-tertiary))',
    );
  });

  it('does not take its own write for a new colour from the app', () => {
    const el = add('<div style="color: #080C15"></div>');
    engine.track(el, reading('hex:#080c15'));
    // The observer sees the write it caused, and reads the element again.
    engine.track(el, reading('hex:#080c15'));
    expect(el.getAttribute('style')).toContain('--cl-text-hex-080c15');
    expect(templates).toHaveLength(1);
    engine.reapply(never, new Set(['hex:#080c15']));
    expect(el.style.color).toBe('rgb(8, 12, 21)');
  });

  it('takes a colour the app sets afterwards as the new original', () => {
    const el = add('<div style="color: #080C15"></div>');
    engine.track(el, reading('hex:#080c15'));
    // A re-render sets something else.
    el.style.color = '#0000FF';
    engine.track(el, reading('hex:#0000ff'));
    expect(el.getAttribute('style')).toContain('--cl-text-hex-0000ff');
    engine.reapply(never, new Set(['hex:#0000ff']));
    expect(el.style.color).toBe('rgb(0, 0, 255)');
  });

  it('forgets an element whose colour the app removed', () => {
    const el = add('<div style="color: #080C15"></div>');
    engine.track(el, never);
    el.removeAttribute('style');
    engine.track(el, never);
    expect(engine.counts().size).toBe(0);
  });

  it('skips a style with no colour in it', () => {
    const el = add('<div style="transform: translate(1px, 2px)"></div>');
    engine.track(el, never);
    expect(templates).toEqual([]);
  });
});

describe('DomEngine: SVG attributes', () => {
  it('points fill and stroke at their variables', () => {
    const el = add('<svg><rect fill="#FFFFFF" stroke="#4D6A74" /></svg>');
    const rect = el.querySelector('rect') as Element;
    engine.scan(el, reading('hex:#4d6a74'));
    expect(rect.getAttribute('stroke')).toBe('var(--cl-border-hex-4d6a74, #4D6A74)');
    expect(rect.getAttribute('fill')).toBe('#FFFFFF');
    engine.reapply(never, new Set(['hex:#4d6a74']));
    expect(rect.getAttribute('stroke')).toBe('#4D6A74');
  });

  it('leaves currentColor, none and urls alone', () => {
    const el = add('<svg><path fill="none" stroke="currentColor" /><rect fill="url(#g)" /></svg>');
    engine.scan(el, never);
    expect(templates).toEqual([]);
  });

  it('finds everything under a subtree it is handed', () => {
    const el = add(
      '<div><svg><g><circle fill="#E0A33C" /></g></svg><p style="color:#FF0000"></p></div>',
    );
    engine.scan(el, never);
    expect(slotsSeen()).toEqual(['hex:#e0a33c', 'hex:#ff0000']);
  });
});

describe('DomEngine: counting and locating', () => {
  it('counts how many elements use each slot, and finds them', () => {
    const a = add('<div style="color: #FF0000"></div>');
    const b = add('<div style="color: #FF0000; background: #0000FF"></div>');
    engine.track(a, never);
    engine.track(b, never);
    expect(engine.counts().get('hex:#ff0000')).toBe(2);
    expect(engine.counts().get('hex:#0000ff')).toBe(1);
    expect(engine.elementsFor('hex:#ff0000', 10)).toEqual([a, b]);
    expect(engine.elementsFor('hex:#ff0000', 1)).toEqual([a]);
  });

  it('forgets elements that have left the page', () => {
    const a = add('<div style="color: #FF0000"></div>');
    engine.track(a, never);
    a.parentElement?.remove();
    expect(engine.counts().size).toBe(0);
    expect(engine.elementsFor('hex:#ff0000', 10)).toEqual([]);
  });

  it('hands over the templates of an element, for the inspector', () => {
    const a = add('<div style="color: #FF0000; background: #0000FF"></div>');
    engine.track(a, never);
    expect(
      engine
        .templatesOf(a)
        .flatMap((t) => t.slots)
        .sort(),
    ).toEqual(['hex:#0000ff', 'hex:#ff0000']);
  });
});
