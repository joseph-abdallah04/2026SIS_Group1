import { parseColour } from '../colour/parse';
import { findColourVars } from '../colour/tokens';
import { hexSlotKey, slotKeyForVar } from '../model/slots';
import { roleOfName, roleOfUtility } from './roles';
import { blankTsComments, lineStartsOf, positionOf, snippetAt } from './source';
import { type ClassUse, type FileScan, type Role } from './types';

const HEX = /#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{4}|[0-9a-fA-F]{3})(?![0-9A-Za-z_-])/g;
// Not \b: Tailwind joins the parts of an arbitrary value with underscores, and a
// word boundary does not fall between `_` and `r`.
const FUNCTION = /(?<![A-Za-z0-9-])(?:rgba?|hsla?|oklch|oklab)\([^()]*\)/gi;

/** Tailwind's palette families: a class in one of these names a var slot. */
const FAMILY =
  '(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)';
const UTILITY = new RegExp(
  '(?<![\\w-])(bg|text|border(?:-[xytblrse])?|ring-offset|ring|outline|fill|stroke|from|via|to|divide|placeholder|decoration|accent|caret|shadow|inset-shadow|drop-shadow)-(rt-[a-z]+(?:-[a-z]+)*|white|black|' +
    FAMILY +
    '-\\d{2,3})(?:\\/(\\d{1,3}|\\[[\\d.]+\\]))?(?![\\w-])',
  'g',
);

/** `bg-[#f7f4ee]` or `shadow-[0_6px_24px_rgba(...)]`: the utility prefix around an arbitrary value. */
const ARBITRARY = /(?:^|[:\s'"`])!?([a-z]+(?:-[a-z]+)*)-\[[^\]\s]*$/;

const TOP_LEVEL_DECLARATION =
  /^(?:export\s+)?(?:default\s+)?(?:async\s+)?(?:const|let|var|function\*?|class)\s+([A-Za-z_$][\w$]*)/;

/**
 * The name of the top-level declaration above each line. Constants hold most of
 * the palette, so naming one is what makes an occurrence recognisable.
 */
function declarationNames(lines: readonly string[]): (string | null)[] {
  const names: (string | null)[] = [];
  let current: string | null = null;
  for (const line of lines) {
    const match = TOP_LEVEL_DECLARATION.exec(line);
    if (match) current = match[1] ?? null;
    names.push(current);
  }
  return names;
}

/** `40` or `[0.4]` after the slash of a class, as a fraction. 1 when there is none. */
function opacityOf(text: string | undefined): number {
  if (!text) return 1;
  const value = text.startsWith('[') ? parseFloat(text.slice(1, -1)) : parseInt(text, 10) / 100;
  return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 1;
}

/** The last `key:` or `key=` before the colour on its line. */
function keyBefore(prefix: string): string | null {
  let key: string | null = null;
  for (const match of prefix.matchAll(/([A-Za-z_$][\w$-]*)\s*[:=]/g)) key = match[1] ?? null;
  return key;
}

/** A value that starts its own line takes its key from the end of the line above: `key:` then the value. */
function keyAbove(lines: readonly string[], line: number): string | null {
  const above = (lines[line - 2] ?? '').trimEnd();
  const match = /([A-Za-z_$][\w$-]*)\s*[:=]$/.exec(above);
  return match?.[1] ?? null;
}

/**
 * The colours in a TypeScript or TSX file: every literal, and the brand-token
 * and palette classes it uses. The classes are counted per file, not listed,
 * since a token like ink is in hundreds of places.
 */
export function scanTsSource(file: string, text: string, exportOnly = false): FileScan {
  const clean = blankTsComments(text);
  const starts = lineStartsOf(text);
  const lines = clean.split('\n');
  const declarations = declarationNames(lines);
  const scan: FileScan = { literals: [], classes: [], refs: [], tokens: [] };

  const note = (index: number, raw: string): void => {
    const colour = parseColour(raw);
    if (!colour) return;
    const { line, col } = positionOf(starts, index);
    const lineText = lines[line - 1] ?? '';
    const prefix = lineText.slice(0, col - 1);

    let role: Role = 'other';
    let context = '';
    const arbitrary = ARBITRARY.exec(prefix);
    if (arbitrary?.[1]) {
      role = roleOfUtility(arbitrary[1]);
      context = `class ${arbitrary[1]}-[…]`;
    } else {
      const key = keyBefore(prefix) ?? keyAbove(lines, line);
      const name = declarations[line - 1];
      role = roleOfName(key ?? name ?? '');
      context = [name, key].filter((part, i, all) => part && all.indexOf(part) === i).join(' · ');
    }

    scan.literals.push({
      slot: hexSlotKey(colour.rgba),
      file,
      line,
      col,
      raw,
      alpha: colour.rgba.a,
      role,
      context,
      snippet: snippetAt(text, starts, line),
      exportOnly,
      ...(arbitrary?.[1] &&
      lineText.charAt(col - 2) === '[' &&
      lineText.charAt(col - 1 + raw.length) === ']'
        ? { colourClass: true as const }
        : {}),
    });
  };

  for (const span of findColourVars(clean)) {
    const slot = slotKeyForVar(span.name);
    if (!slot) continue;
    const { line, col } = positionOf(starts, span.start);
    const prefix = (lines[line - 1] ?? '').slice(0, col - 1);
    const arbitrary = ARBITRARY.exec(prefix);
    const key = keyBefore(prefix) ?? keyAbove(lines, line);
    const name = declarations[line - 1];
    scan.refs.push({
      slot,
      file,
      line,
      col,
      raw: span.text,
      name: span.name,
      alpha: span.alpha,
      role: arbitrary?.[1] ? roleOfUtility(arbitrary[1]) : roleOfName(key ?? name ?? ''),
      context: arbitrary?.[1]
        ? `class ${arbitrary[1]}-[…]`
        : [name, key].filter((part, i, all) => part && all.indexOf(part) === i).join(' · '),
      snippet: snippetAt(text, starts, line),
    });
  }

  for (const match of clean.matchAll(HEX)) {
    // An HTML entity such as &#039; is not a colour.
    if (match.index > 0 && /[&\w]/.test(clean.charAt(match.index - 1))) continue;
    note(match.index, match[0]);
  }
  for (const match of clean.matchAll(FUNCTION)) note(match.index, match[0]);

  const counts = new Map<string, ClassUse>();
  for (const match of clean.matchAll(UTILITY)) {
    const name = match[2];
    if (!name) continue;
    const slot = name.startsWith('rt-') ? `token:${name}` : `tw:${name}`;
    const role = roleOfUtility(match[1] ?? '');
    const alpha = opacityOf(match[3]);
    const key = `${slot}|${role}|${alpha}`;
    const use = counts.get(key) ?? { slot, file, role, alpha, count: 0 };
    use.count++;
    counts.set(key, use);
  }
  scan.classes.push(...counts.values());

  scan.literals.sort((a, b) => a.line - b.line || a.col - b.col);
  return scan;
}
