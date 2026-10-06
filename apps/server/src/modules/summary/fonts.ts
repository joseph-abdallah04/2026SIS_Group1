import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * Inter, the face the board lays every label out for, in the weights a canvas
 * uses: 400 for text, 500 for a sticky, 600 for headers and text shapes, 700
 * for bold. Static TrueType from the official release (rsms/inter v4.1, SIL
 * Open Font License, see `assets/fonts/LICENSE.txt`) — resvg reads TrueType
 * and OpenType, not the woff2 the web app ships.
 *
 * Without them the recap fell back to whatever sans-serif the host had, and a
 * label wrapped for Inter's widths could run wide of its shape.
 */
const INTER_FILES = [
  'Inter-Regular.ttf',
  'Inter-Medium.ttf',
  'Inter-SemiBold.ttf',
  'Inter-Bold.ttf',
] as const;

/**
 * `apps/server/assets/fonts`, from this module. The same three steps up from
 * `src/modules/summary` and from `dist/modules/summary`, so it resolves the
 * same under the tests, in development and in the built server.
 */
const FONT_DIR = new URL('../../../assets/fonts/', import.meta.url);

let resolved: string[] | null = null;

/**
 * The Inter files to hand resvg, as paths. Only those actually present: a
 * deployment that left them out draws the recap in the host's own fonts, as
 * it did before, rather than failing to draw it at all.
 */
export function interFontFiles(): string[] {
  resolved ??= INTER_FILES.map((name) => fileURLToPath(new URL(name, FONT_DIR))).filter((path) =>
    existsSync(path),
  );
  return resolved;
}
