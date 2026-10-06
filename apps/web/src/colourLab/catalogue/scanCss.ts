import { findColourTokens, findColourVars } from '../colour/tokens';
import { hexSlotKey, slotKeyForVar } from '../model/slots';
import { roleAtOffset } from './roles';
import { blankCssComments, lineStartsOf, positionOf, snippetAt } from './source';
import { type FileScan } from './types';

interface Block {
  header: string;
}

/** The selectors a declaration sits under, or the animation it is a step of. */
function contextOf(stack: readonly Block[]): string {
  const keyframes = stack.find((block) => block.header.startsWith('@keyframes'));
  if (keyframes) return keyframes.header.replace(/\s+/g, ' ');
  const rules = stack.filter((block) => !block.header.startsWith('@'));
  if (rules.length > 0) {
    return rules
      .map((block) => block.header.replace(/\s+/g, ' '))
      .join(' ')
      .slice(0, 90);
  }
  const at = stack.find((block) => /^@(keyframes|font-face|property)/.test(block.header));
  return at ? at.header.replace(/\s+/g, ' ') : '';
}

/**
 * The colours in a stylesheet's source: every literal in a declaration, and
 * each token the @theme block defines. Reads the source, not the CSSOM, so it
 * finds colours in rules the page is not using right now.
 */
export function scanCssSource(file: string, text: string, exportOnly = false): FileScan {
  const clean = blankCssComments(text);
  const starts = lineStartsOf(text);
  const scan: FileScan = { literals: [], classes: [], refs: [], tokens: [] };
  const stack: Block[] = [];

  const declaration = (from: number, to: number): void => {
    if (stack.length === 0) return;
    const chunk = clean.slice(from, to);
    const colon = chunk.indexOf(':');
    if (colon <= 0) return;
    const name = chunk.slice(0, colon).trim();
    const rawValue = chunk.slice(colon + 1);
    const value = rawValue.trim();
    if (name === '' || value === '') return;
    const valueStart = from + colon + 1 + (rawValue.length - rawValue.trimStart().length);

    const inTheme = stack.some((block) => block.header.startsWith('@theme'));
    if (inTheme) {
      const slot = slotKeyForVar(name);
      if (slot) {
        const at = positionOf(starts, valueStart);
        scan.tokens.push({
          slot,
          name,
          value,
          file,
          line: positionOf(starts, from + chunk.indexOf(name)).line,
          col: at.col,
          snippet: snippetAt(text, starts, at.line),
        });
      }
      return;
    }

    for (const span of findColourVars(value)) {
      const slot = slotKeyForVar(span.name);
      if (!slot) continue;
      const { line, col } = positionOf(starts, valueStart + span.start);
      scan.refs.push({
        slot,
        file,
        line,
        col,
        raw: span.text,
        name: span.name,
        alpha: span.alpha,
        role: roleAtOffset(name, value, span.start),
        context: contextOf(stack) || name,
        snippet: snippetAt(text, starts, line),
      });
    }

    for (const token of findColourTokens(value)) {
      const { line, col } = positionOf(starts, valueStart + token.start);
      scan.literals.push({
        slot: hexSlotKey(token.colour.rgba),
        file,
        line,
        col,
        raw: token.text,
        alpha: token.colour.rgba.a,
        role: roleAtOffset(name, value, token.start),
        context: contextOf(stack) || name,
        snippet: snippetAt(text, starts, line),
        exportOnly,
      });
    }
  };

  let segment = 0;
  let parens = 0;
  for (let i = 0; i < clean.length; i++) {
    const ch = clean.charAt(i);
    if (ch === '"' || ch === "'") {
      for (i++; i < clean.length && clean.charAt(i) !== ch; i++) {
        if (clean.charAt(i) === '\\') i++;
      }
      continue;
    }
    if (ch === '(') parens++;
    else if (ch === ')') parens--;
    if (parens > 0) continue;
    if (ch === '{') {
      stack.push({ header: clean.slice(segment, i).trim() });
      segment = i + 1;
    } else if (ch === ';') {
      declaration(segment, i);
      segment = i + 1;
    } else if (ch === '}') {
      if (clean.slice(segment, i).trim() !== '') declaration(segment, i);
      stack.pop();
      segment = i + 1;
    }
  }
  return scan;
}
