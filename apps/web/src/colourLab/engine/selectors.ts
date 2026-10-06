/**
 * Turning a rule's selector into one that asks "is anything on the page that
 * this could style?". The states a selector waits for (hover, focus, an
 * `::after`) are not on the page until someone causes them, so they are
 * stripped, and what is left is the element the rule belongs to.
 */

const DYNAMIC_PSEUDO_CLASSES =
  /(?<!\\):(?:hover|focus|focus-visible|focus-within|active|visited|target|target-within|user-invalid|user-valid|-webkit-autofill|fullscreen|popover-open|modal|open|playing|paused)(?![\w-])/g;

const PSEUDO_ELEMENTS =
  /(?<!\\)::?(?:before|after|first-line|first-letter)(?![\w-])|(?<!\\)::[a-zA-Z-]+(?:\([^)]*\))?/g;

/** Splits at a separator that is not inside brackets, parens or quotes. */
export function splitTopLevel(text: string, separator: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text.charAt(i);
    if (ch === '\\') i++;
    else if (ch === '"' || ch === "'") {
      for (i++; i < text.length && text.charAt(i) !== ch; i++) {
        if (text.charAt(i) === '\\') i++;
      }
    } else if (ch === '(' || ch === '[') depth++;
    else if (ch === ')' || ch === ']') depth--;
    else if (ch === separator && depth === 0) {
      parts.push(text.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(text.slice(start));
  return parts;
}

/**
 * The selector list for the elements a rule styles, with the states and
 * pseudo-elements removed. `parent` is the selector a nested rule sits in,
 * which `&` stands for.
 */
export function cleanSelector(selectorText: string, parent: string | null): string {
  const cleaned = splitTopLevel(selectorText, ',').map((raw) => {
    let part = raw.trim();
    if (part.includes('&')) part = part.replace(/&/g, parent ? `:is(${parent})` : '*');
    part = part
      .replace(PSEUDO_ELEMENTS, '')
      .replace(DYNAMIC_PSEUDO_CLASSES, '')
      .replace(/:(?:not|is|where)\(\s*\)/g, '')
      .trim()
      .replace(/[>+~\s]+$/, '');
    return part === '' ? '*' : part;
  });
  return cleaned.join(', ');
}
