import type { BoardItem } from '@roundtable/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { TINY_JPEG, TINY_PNG, TINY_WEBP } from '../tools/image/testImages';
import {
  exportFileName,
  exportFormats,
  forgetInterFontFaces,
  imageFile,
  pngScale,
  rasterizeSvg,
  studioExportSvg,
  withoutEmbeddedFonts,
} from './proposalExport';

function item(artifactJson: BoardItem['artifactJson'], authorName = 'Ada Lovelace'): BoardItem {
  return {
    id: 'p1',
    questionId: 'q1',
    authorId: 'u1',
    authorName,
    type: artifactJson.type,
    artifactJson,
    x: 0,
    y: 0,
    createdAt: '2026-09-01T14:32:00',
    z: 0,
    editedAt: null,
    extendsProposalId: null,
    extendsFrom: null,
    reactions: [],
  };
}

const CANVAS = {
  type: 'diagram' as const,
  nodes: [
    { id: 'n1', label: 'Plain', x: 100, y: 80, shape: 'box' as const },
    { id: 'n2', label: 'Bold <yes>', x: 300, y: 80, shape: 'box' as const, labelBold: true },
  ],
  edges: [],
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  // Each test starts as a fresh page would, with no fonts read yet.
  forgetInterFontFaces();
});

describe('exportFormats', () => {
  it('offers a canvas as a PNG and an SVG, a picture as itself, and a drawing as a PNG', () => {
    expect(exportFormats(item(CANVAS))).toEqual(['png', 'svg']);
    expect(exportFormats(item({ type: 'image', src: TINY_PNG, width: 1, height: 1 }))).toEqual([
      'original',
    ]);
    expect(exportFormats(item({ type: 'drawing', svg: '<svg><path d="M0 0"/></svg>' }))).toEqual([
      'png',
    ]);
  });

  it('offers nothing where there is no artwork', () => {
    expect(exportFormats(item({ type: 'sticky', text: 'Hi', color: 'yellow' }))).toEqual([]);
    expect(exportFormats(item({ type: 'diagram', nodes: [], edges: [] }))).toEqual([]);
    expect(exportFormats(item({ type: 'drawing', svg: '  ' }))).toEqual([]);
    expect(exportFormats(item({ type: 'image', src: TINY_WEBP, width: 1, height: 1 }))).toEqual([]);
  });
});

describe('exportFileName', () => {
  it('names the file after the kind, the author and the time it was proposed', () => {
    expect(exportFileName(item(CANVAS), 'png')).toBe('roundtable-diagram-ada-lovelace-14-32.png');
  });

  it('keeps the name to plain ASCII', () => {
    expect(exportFileName(item(CANVAS, 'Zoë  Ó’Brien!'), 'svg')).toBe(
      'roundtable-diagram-zoe-o-brien-14-32.svg',
    );
  });

  it('still has a name when the author has none it can use', () => {
    expect(exportFileName(item(CANVAS, '李明'), 'png')).toBe(
      'roundtable-diagram-proposal-14-32.png',
    );
  });
});

describe('imageFile', () => {
  it('gives back the stored picture byte for byte, in its own format', async () => {
    const png = imageFile(TINY_PNG)!;
    expect(png.extension).toBe('png');
    expect(png.blob.type).toBe('image/png');
    const bytes = new Uint8Array(await png.blob.arrayBuffer());
    expect(Array.from(bytes.subarray(1, 4), (byte) => String.fromCharCode(byte)).join('')).toBe(
      'PNG',
    );
    expect(btoa(String.fromCharCode(...bytes))).toBe(TINY_PNG.split(',')[1]);

    const jpeg = imageFile(TINY_JPEG)!;
    expect(jpeg.extension).toBe('jpg');
    expect(jpeg.blob.type).toBe('image/jpeg');
  });

  it('refuses anything the board would not draw', () => {
    expect(imageFile(TINY_WEBP)).toBeNull();
    expect(imageFile('https://example.com/a.png')).toBeNull();
  });
});

describe('studioExportSvg', () => {
  it('is a standalone file framed to the content, on white', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Promise.reject(new Error('offline'))),
    );
    const { svg, width, height } = await studioExportSvg(CANVAS);

    expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
    // Framed to the shapes and a 24-unit margin, not to the sheet's corner.
    expect(svg).toMatch(/viewBox="76 56 /);
    expect(svg).toContain(`width="${width}" height="${height}"`);
    expect(svg).toMatch(/<rect x="76" y="56" width="\d+" height="\d+" fill="#FFFFFF"\/>/);
    expect(svg).toContain('Bold &lt;yes&gt;');
    expect(svg).not.toContain('<yes>');
    // Without the fonts the file still saves; its labels fall back.
    expect(svg).not.toContain('@font-face');
  });

  it('carries Inter inside it, in only the weights its labels use', async () => {
    const fetched: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        fetched.push(url);
        return { ok: true, blob: async () => new Blob(['woff2']) };
      }),
    );
    const { svg } = await studioExportSvg(CANVAS);

    expect(fetched).toHaveLength(2);
    expect(fetched.some((url) => url.includes('400'))).toBe(true);
    expect(fetched.some((url) => url.includes('700'))).toBe(true);
    expect(svg).toContain('font-weight:400;src:url(data:font/woff2;base64,d29mZjI=)');
    expect(svg).toContain('font-weight:700;');
  });
});

describe('pngScale', () => {
  it('draws three times finer, but never past the longest edge a PNG may have', () => {
    expect(pngScale(400, 300)).toBe(3);
    expect(pngScale(4096, 100)).toBe(1);
    expect(pngScale(8192, 100)).toBe(0.5);
  });
});

describe('studioExportSvg framing', () => {
  it('takes in the corners of a turned shape rather than cutting them off', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Promise.reject(new Error('offline'))),
    );
    const { svg } = await studioExportSvg({
      nodes: [
        {
          id: 'n',
          label: 'Turned',
          x: 100,
          y: 100,
          shape: 'box',
          width: 120,
          height: 56,
          rotation: 90,
        },
      ],
      edges: [],
    });
    // Stood on end, the box paints from y=68 to y=188; the frame adds 24.
    const [, y, , height] = /viewBox="([-\d.]+) ([-\d.]+) ([-\d.]+) ([-\d.]+)"/
      .exec(svg)!
      .slice(1)
      .map(Number);
    expect(y).toBeLessThanOrEqual(68 - 24);
    expect(y! + height!).toBeGreaterThanOrEqual(188 + 24);
  });
});

describe('Inter in an export', () => {
  it('is read once per page, however many canvases are exported', async () => {
    const fetchFont = vi.fn(async () => ({ ok: true, blob: async () => new Blob(['woff2']) }));
    vi.stubGlobal('fetch', fetchFont);

    await studioExportSvg(CANVAS);
    await studioExportSvg(CANVAS);

    // Two weights in use (400 and the bold label's 700), fetched once each.
    expect(fetchFont).toHaveBeenCalledTimes(2);
  });

  it('is tried again on the next export when it could not be read', async () => {
    const fetchFont = vi.fn(async () => Promise.reject(new Error('offline')));
    vi.stubGlobal('fetch', fetchFont);

    await studioExportSvg(CANVAS);
    await studioExportSvg(CANVAS);

    expect(fetchFont).toHaveBeenCalledTimes(4);
  });

  it('comes out whole, leaving everything else in the file', () => {
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg"><style>@font-face{font-family:Inter}</style><text>Hi</text></svg>';
    expect(withoutEmbeddedFonts(svg)).toBe(
      '<svg xmlns="http://www.w3.org/2000/svg"><text>Hi</text></svg>',
    );
  });
});

describe('rasterizeSvg', () => {
  /**
   * jsdom loads no images and has no canvas, so both are stood in for: an
   * image that loads as soon as it is given an address, and a canvas whose
   * draw fails the first time — the way a browser that will not draw an SVG
   * carrying its own fonts fails.
   */
  function fakeBrowser({ failFirstDraw }: { failFirstDraw: boolean }) {
    const drawn: string[] = [];
    const sources = new Map<string, Blob>();
    let next = 0;
    vi.stubGlobal('URL', {
      ...URL,
      createObjectURL: (blob: Blob) => {
        const url = `blob:svg-${(next += 1)}`;
        sources.set(url, blob);
        return url;
      },
      revokeObjectURL: () => {},
    });
    class LoadingImage {
      decoding = 'auto';
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      decode = () => Promise.resolve();
      set src(url: string) {
        drawn.push(url);
        queueMicrotask(() => this.onload?.());
      }
    }
    vi.stubGlobal('Image', LoadingImage);
    let draws = 0;
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      fillRect: () => {},
      drawImage: () => {
        draws += 1;
        if (failFirstDraw && draws === 1) throw new DOMException('Tainted', 'SecurityError');
      },
    } as unknown as CanvasRenderingContext2D);
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((callback) =>
      callback(new Blob(['png'], { type: 'image/png' })),
    );
    return { drawn, sources };
  }

  const WITH_FONTS = {
    svg: '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><style>@font-face{}</style><rect/></svg>',
    width: 10,
    height: 10,
  };

  it('draws the file as it is, fonts and all, where the browser allows it', async () => {
    const { drawn, sources } = fakeBrowser({ failFirstDraw: false });
    const png = await rasterizeSvg(WITH_FONTS);

    expect(png.type).toBe('image/png');
    expect(drawn).toHaveLength(1);
    expect(await sources.get(drawn[0]!)!.text()).toContain('<style>');
  });

  it('tries again without its fonts where the browser will not draw them, rather than failing', async () => {
    const { drawn, sources } = fakeBrowser({ failFirstDraw: true });
    const png = await rasterizeSvg(WITH_FONTS);

    expect(png.type).toBe('image/png');
    expect(drawn).toHaveLength(2);
    expect(await sources.get(drawn[1]!)!.text()).not.toContain('<style>');
  });

  it('still fails where there were no fonts to blame', async () => {
    fakeBrowser({ failFirstDraw: true });
    await expect(rasterizeSvg({ ...WITH_FONTS, svg: '<svg/>' })).rejects.toThrow('Tainted');
  });
});
