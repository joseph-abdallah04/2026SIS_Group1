import { describe, expect, it } from 'vitest';

import { type Rgb } from '../colour/convert';
import { buildSvgTemplate, isSvgSource, readSvgDataUrl, toSvgDataUrl } from './images';
import { renderValues } from './template';

const red: Rgb = { r: 255, g: 0, b: 0 };

const LOGO =
  '<svg width="10" height="10"><circle cx="1" cy="1" r="1" fill="#E0A33C"/>' +
  '<circle fill="black"/><circle stroke="white" fill=\'#CFCFCF\'/><path fill="none"/></svg>';

describe('buildSvgTemplate', () => {
  const template = buildSvgTemplate(LOGO);

  it('finds hex and named colours in presentation attributes', () => {
    expect(template?.slots.sort()).toEqual([
      'hex:#000000',
      'hex:#cfcfcf',
      'hex:#e0a33c',
      'hex:#ffffff',
    ]);
  });

  it('rewrites one colour and leaves the rest of the file byte for byte', () => {
    if (!template) throw new Error('fixture');
    const out = renderValues(template, (slot) => (slot === 'hex:#e0a33c' ? red : null));
    expect(out).toBe(LOGO.replace('#E0A33C', '#ff0000'));
  });

  it('writes a named colour back as hex', () => {
    if (!template) throw new Error('fixture');
    const out = renderValues(template, (slot) => (slot === 'hex:#000000' ? red : null));
    expect(out).toContain('fill="#ff0000"');
    expect(out).not.toContain('"black"');
  });

  it('is null for an SVG with nothing to edit', () => {
    expect(buildSvgTemplate('<svg><path fill="none" stroke="currentColor"/></svg>')).toBeNull();
  });

  it('reads colours in a style attribute', () => {
    const t = buildSvgTemplate('<svg><g style="fill:#ff0000;stroke:#0000ff"/></svg>');
    expect(t?.slots.sort()).toEqual(['hex:#0000ff', 'hex:#ff0000']);
  });
});

describe('isSvgSource', () => {
  it('recognises svg files and svg data URLs only', () => {
    expect(isSvgSource('/assets/roundtable-logo.svg')).toBe(true);
    expect(isSvgSource('/@fs/C:/repo/logo.svg?import')).toBe(true);
    expect(isSvgSource('data:image/svg+xml;utf8,<svg/>')).toBe(true);
    expect(isSvgSource('data:image/png;base64,AAAA')).toBe(false);
    expect(isSvgSource('/photo.jpg')).toBe(false);
    expect(isSvgSource('')).toBe(false);
  });
});

describe('readSvgDataUrl', () => {
  const svg = '<svg fill="#ff0000"><text>é</text></svg>';

  it('reads each encoding an SVG data URL comes in', () => {
    expect(readSvgDataUrl(`data:image/svg+xml;utf8,${svg}`)).toBe(svg);
    expect(readSvgDataUrl(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`)).toBe(svg);
    const base64 = btoa(String.fromCharCode(...new TextEncoder().encode(svg)));
    expect(readSvgDataUrl(`data:image/svg+xml;base64,${base64}`)).toBe(svg);
  });

  it('round-trips what it writes', () => {
    expect(readSvgDataUrl(toSvgDataUrl(svg))).toBe(svg);
  });

  it('is null for something that is not a data URL', () => {
    expect(readSvgDataUrl('nope')).toBeNull();
  });
});
