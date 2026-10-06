import { describe, expect, it } from 'vitest';

import {
  roleAtOffset,
  roleOfName,
  roleOfProperty,
  roleOfShadowLayer,
  roleOfUtility,
} from './roles';

describe('roleOfProperty', () => {
  it('reads the role from a CSS property', () => {
    expect(roleOfProperty('color')).toBe('text');
    expect(roleOfProperty('background-color')).toBe('fill');
    expect(roleOfProperty('border-top-color')).toBe('border');
    expect(roleOfProperty('outline-color')).toBe('border');
    expect(roleOfProperty('box-shadow')).toBe('shadow');
    expect(roleOfProperty('stroke')).toBe('border');
    expect(roleOfProperty('fill')).toBe('fill');
    expect(roleOfProperty('width')).toBe('other');
  });

  it("reads the role of the app's own custom properties from their names", () => {
    expect(roleOfProperty('--rt-paper')).toBe('fill');
    expect(roleOfProperty('--rt-chip-edge')).toBe('border');
    expect(roleOfProperty('--rt-assistant-ink')).toBe('text');
    expect(roleOfProperty('--rt-card-shadow')).toBe('shadow');
    expect(roleOfProperty('--rt-gap')).toBe('other');
  });

  it("reads Tailwind's own variables by what they feed, not by a guess at their name", () => {
    expect(roleOfProperty('--tw-ring-color')).toBe('border');
    expect(roleOfProperty('--tw-gradient-from')).toBe('fill');
    expect(roleOfProperty('--tw-content')).toBe('other');
  });
});

describe('roleOfShadowLayer', () => {
  it('calls a soft shadow a shadow', () => {
    expect(roleOfShadowLayer('0 8px 24px rgba(8, 12, 21, 0.12)')).toBe('shadow');
    expect(roleOfShadowLayer('0 1px 2px 0 #00000026')).toBe('shadow');
  });

  it('calls a layer with no blur an edge, however the colour is written', () => {
    expect(roleOfShadowLayer('0 0 0 2px rgba(8, 12, 21, 0.4)')).toBe('border');
    expect(roleOfShadowLayer('inset 0 -1px 0 #f1c881')).toBe('border');
    expect(roleOfShadowLayer('0 0 0 1px oklch(0.7 0.1 80)')).toBe('border');
  });

  it('keeps a layer it cannot read a shadow', () => {
    expect(roleOfShadowLayer('var(--tw-shadow)')).toBe('shadow');
  });
});

describe('roleOfUtility and roleOfName', () => {
  it('maps the Tailwind prefixes', () => {
    expect(roleOfUtility('bg')).toBe('fill');
    expect(roleOfUtility('text')).toBe('text');
    expect(roleOfUtility('border-t')).toBe('border');
    expect(roleOfUtility('ring-offset')).toBe('border');
    expect(roleOfUtility('shadow-lg')).toBe('shadow');
    expect(roleOfUtility('drop-shadow-sm')).toBe('shadow');
    expect(roleOfUtility('inset-shadow')).toBe('shadow');
    expect(roleOfUtility('divide')).toBe('border');
  });

  it('guesses from the name of a constant', () => {
    expect(roleOfName('CARD_SHADOW')).toBe('shadow');
    expect(roleOfName('stickyBorder')).toBe('border');
    expect(roleOfName('paperFill')).toBe('fill');
    expect(roleOfName('INK')).toBe('text');
    expect(roleOfName('seatCount')).toBe('other');
  });
});

describe('roleAtOffset', () => {
  const value = '0 8px 24px rgba(8, 12, 21, 0.12), 0 0 0 2px #e0a33c';

  it('tells the layers of a shadow apart', () => {
    expect(roleAtOffset('box-shadow', value, value.indexOf('rgba'))).toBe('shadow');
    expect(roleAtOffset('box-shadow', value, value.indexOf('#e0a33c'))).toBe('border');
  });

  it('gives any other property the role it has', () => {
    expect(roleAtOffset('background', 'linear-gradient(#fff, #000)', 16)).toBe('fill');
    expect(roleAtOffset('color', '#fff', 0)).toBe('text');
    expect(roleAtOffset('--rt-paper', '#fff', 0)).toBe('fill');
  });
});
