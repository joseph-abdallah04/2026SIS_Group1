import type { BoardItem } from '@roundtable/shared';
import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { saveBlob } from '../../lib/saveBlob';
import { TINY_JPEG, TINY_PNG, TINY_WEBP } from '../tools/image/testImages';
import {
  exportFile,
  exportFileName,
  exportFormats,
  forgetInterFontFaces,
  imageFile,
  pngScale,
  rasterizeSvg,
  studioExportSvg,
  useProposalExport,
  withoutEmbeddedFonts,
} from './proposalExport';

vi.mock('../../lib/saveBlob', () => ({ saveBlob: vi.fn() }));

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
  vi.mocked(saveBlob).mockClear();
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
      '<svg xmlns="http://www.w3.org/2000/svg"><style data-roundtable-fonts="">@font-face{font-family:Inter}</style><text>Hi</text></svg>';
    expect(withoutEmbeddedFonts(svg)).toBe(
      '<svg xmlns="http://www.w3.org/2000/svg"><text>Hi</text></svg>',
    );
  });

  it("never touches a <style> that is not the export's own, such as a drawing's", () => {
    const drawing =
      '<svg xmlns="http://www.w3.org/2000/svg"><style>.ink{stroke:red}</style><path class="ink"/></svg>';
    expect(withoutEmbeddedFonts(drawing)).toBe(drawing);
  });

  it('is marked in the file, so it is the one taken out', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, blob: async () => new Blob(['woff2']) })),
    );
    const { svg } = await studioExportSvg(CANVAS);
    expect(svg).toContain('<style data-roundtable-fonts="">@font-face');
    expect(withoutEmbeddedFonts(svg)).not.toContain('@font-face');
  });
});

/**
 * jsdom loads no images and has no canvas, so both are stood in for: an image
 * that loads as soon as it is given an address, and a canvas whose draw can be
 * made to fail the first time — the way a browser that will not draw an SVG
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
  /** The SVG text the nth draw was given. */
  const svgOf = (index: number) => sources.get(drawn[index]!)!.text();
  return { drawn, svgOf };
}

describe('rasterizeSvg', () => {
  const WITH_FONTS = {
    svg: '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><style data-roundtable-fonts="">@font-face{}</style><rect/></svg>',
    width: 10,
    height: 10,
  };

  it('draws the file as it is, fonts and all, where the browser allows it', async () => {
    const { drawn, svgOf } = fakeBrowser({ failFirstDraw: false });
    const png = await rasterizeSvg(WITH_FONTS);

    expect(png.type).toBe('image/png');
    expect(drawn).toHaveLength(1);
    expect(await svgOf(0)).toContain('@font-face');
  });

  it('tries again without its fonts where the browser will not draw them, rather than failing', async () => {
    const { drawn, svgOf } = fakeBrowser({ failFirstDraw: true });
    const png = await rasterizeSvg(WITH_FONTS);

    expect(png.type).toBe('image/png');
    expect(drawn).toHaveLength(2);
    expect(await svgOf(1)).not.toContain('@font-face');
  });

  it('still fails where there were no fonts to blame', async () => {
    fakeBrowser({ failFirstDraw: true });
    await expect(rasterizeSvg({ ...WITH_FONTS, svg: '<svg/>' })).rejects.toThrow('Tainted');
  });
});

describe('exporting a legacy drawing', () => {
  const drawing = (svg: string) => item({ type: 'drawing', svg });

  it('draws it to a PNG at its own size, its markup otherwise as written', async () => {
    const { drawn, svgOf } = fakeBrowser({ failFirstDraw: false });
    const { blob, filename } = await exportFile(
      drawing(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300"><style>.ink{stroke:red}</style><path class="ink" d="M0 0L10 10"/></svg>',
      ),
      'png',
    );

    expect(blob.type).toBe('image/png');
    expect(filename).toBe('roundtable-drawing-ada-lovelace-14-32.png');
    expect(drawn).toHaveLength(1);
    const svg = await svgOf(0);
    // Sized from its own viewBox: an SVG with no size of its own draws
    // nothing into a canvas in Firefox.
    expect(svg).toContain('width="400"');
    expect(svg).toContain('height="300"');
    expect(svg).toContain('<style>.ink{stroke:red}</style>');
  });

  it('gives a drawing with no viewBox the sheet a drawing is made on', async () => {
    const { svgOf } = fakeBrowser({ failFirstDraw: false });
    await exportFile(
      drawing('<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0L10 10"/></svg>'),
      'png',
    );

    const svg = await svgOf(0);
    expect(svg).toContain('viewBox="0 0 720 500"');
    expect(svg).toContain('width="720"');
    expect(svg).toContain('height="500"');
  });

  it('never strips its own <style> on a retry, and reports the failure instead', async () => {
    const { drawn } = fakeBrowser({ failFirstDraw: true });
    await expect(
      exportFile(
        drawing('<svg xmlns="http://www.w3.org/2000/svg"><style>.a{}</style><rect/></svg>'),
        'png',
      ),
    ).rejects.toThrow('Tainted');
    expect(drawn).toHaveLength(1);
  });

  it('refuses markup that is not an SVG at all', async () => {
    fakeBrowser({ failFirstDraw: false });
    await expect(exportFile(drawing('just some words'), 'png')).rejects.toThrow(
      'Nothing to export',
    );
  });

  it('is never offered as an SVG file', async () => {
    await expect(
      exportFile(drawing('<svg xmlns="http://www.w3.org/2000/svg"/>'), 'svg'),
    ).rejects.toThrow('Nothing to export');
  });
});

describe('useProposalExport', () => {
  const PICTURE = item({ type: 'image', src: TINY_PNG, width: 1, height: 1 });

  it('ignores a second press on the same card while its export is still going', async () => {
    const report = vi.fn();
    const { result } = renderHook(() => useProposalExport(report));

    result.current(PICTURE, 'original');
    result.current(PICTURE, 'original');

    await waitFor(() => expect(report).toHaveBeenCalledTimes(1));
    expect(saveBlob).toHaveBeenCalledTimes(1);
    expect(report).toHaveBeenCalledWith({ ok: true, text: 'Exported image' });
  });

  it('takes the next press once the export has finished', async () => {
    const report = vi.fn();
    const { result } = renderHook(() => useProposalExport(report));

    result.current(PICTURE, 'original');
    await waitFor(() => expect(report).toHaveBeenCalledTimes(1));
    result.current(PICTURE, 'original');
    await waitFor(() => expect(report).toHaveBeenCalledTimes(2));
    expect(saveBlob).toHaveBeenCalledTimes(2);
  });

  it('lets two different cards export at once', async () => {
    const report = vi.fn();
    const { result } = renderHook(() => useProposalExport(report));

    result.current(PICTURE, 'original');
    result.current({ ...PICTURE, id: 'p2' }, 'original');

    await waitFor(() => expect(report).toHaveBeenCalledTimes(2));
    expect(saveBlob).toHaveBeenCalledTimes(2);
  });

  it('says so when a card cannot be exported', async () => {
    const report = vi.fn();
    const { result } = renderHook(() => useProposalExport(report));

    result.current(item({ type: 'sticky', text: 'Hi', color: 'yellow' }), 'png');

    await waitFor(() =>
      expect(report).toHaveBeenCalledWith({ ok: false, text: 'Could not export that sticky note' }),
    );
    expect(saveBlob).not.toHaveBeenCalled();
  });
});
