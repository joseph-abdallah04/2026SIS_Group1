// The part of the Colour Lab apply script that changes text.
//
// It has no imports and touches no files, so the lab can test it on its own and paste it,
// whole, into the script that a prompt carries. Plain JavaScript on purpose: the script runs
// under Node on a branch that has never heard of the lab.

/** A word character, for telling `#fff` from the start of `#ffffff`. */
const isWord = (ch) => /[0-9A-Za-z_]/.test(ch);

/** Whether `text` stands at `start` in `line` as a whole token, not as the front of a longer one. */
export function standsAt(line, start, text) {
  if (!line.startsWith(text, start)) return false;
  const last = text.charAt(text.length - 1);
  return !(isWord(last) && isWord(line.charAt(start + text.length)));
}

/** Snippets are cut at this length when the lab writes them. */
const ANCHOR_LENGTH = 160;

const readsAs = (line, anchor) => line.trim().slice(0, ANCHOR_LENGTH) === anchor;

/** The `nth` whole-token occurrence of `text` in `line`, as an index, or -1. */
export function occurrence(line, text, nth) {
  let from = 0;
  let seen = -1;
  for (;;) {
    const index = line.indexOf(text, from);
    if (index < 0) return -1;
    if (standsAt(line, index, text) && !isWord(line.charAt(index - 1)) && ++seen === nth) {
      return index;
    }
    from = index + 1;
  }
}

/**
 * Where an edit belongs in a file's lines: `{ line, start, old }` (0-based), `'already'` when
 * the new text is there, or `null` when it cannot be found.
 *
 * Exactly where the lab saw it is tried first. Failing that, a line that reads the same,
 * nearest first, since a file that has gained or lost a few lines is still the same file.
 */
export function locate(lines, edit, after = null) {
  const home = edit.line - 1;
  const start = edit.col - 1;
  const here = lines[home];
  if (here !== undefined) {
    // Looked for first: the new text can begin with the old.
    if (standsAt(here, start, edit.new)) return 'already';
    for (const old of edit.olds) {
      if (standsAt(here, start, old)) return { line: home, start, old };
    }
  }
  for (let distance = 0; distance <= 400; distance++) {
    const candidates = distance === 0 ? [home] : [home - distance, home + distance];
    for (const index of candidates) {
      const line = lines[index];
      if (line === undefined) continue;
      // The line as it reads once the edits are made: they have been, and the file has moved since.
      if (after !== null && readsAs(line, after)) return 'already';
      if (!readsAs(line, edit.anchor)) continue;
      for (const old of edit.olds) {
        const found = occurrence(line, old, edit.nth);
        if (found >= 0) return { line: index, start: found, old };
      }
    }
  }
  return null;
}

/**
 * What each edited line reads as once all its edits are made, keyed by line and anchor, so an
 * edit can be known as done after the line has moved. Lines the anchor cut short are left out:
 * what came after the cut is not known.
 */
function afterAnchors(edits) {
  const groups = new Map();
  for (const edit of edits) {
    const key = edit.line + '|' + edit.anchor;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(edit);
  }
  const out = new Map();
  for (const [key, group] of groups) {
    const anchor = group[0].anchor;
    if (anchor.length >= ANCHOR_LENGTH) continue;
    const spots = group.map((edit) => ({
      index: occurrence(anchor, edit.olds[0], edit.nth),
      old: edit.olds[0],
      new: edit.new,
    }));
    if (spots.some((spot) => spot.index < 0)) continue;
    spots.sort((a, b) => b.index - a.index);
    let text = anchor;
    for (const spot of spots)
      text = text.slice(0, spot.index) + spot.new + text.slice(spot.index + spot.old.length);
    out.set(key, text.slice(0, ANCHOR_LENGTH));
  }
  return out;
}

/**
 * Applies positional edits to one file's text. Lines keep their endings, so a file that
 * uses CRLF still does. Edits on one line are made right to left so none moves another.
 */
export function applyEdits(text, edits) {
  const lines = text.split('\n');
  const applied = [];
  const already = [];
  const skipped = [];
  const jobs = [];
  const after = afterAnchors(edits);

  for (const edit of edits) {
    const found = locate(lines, edit, after.get(edit.line + '|' + edit.anchor) ?? null);
    if (found === 'already') already.push(edit);
    else if (found === null) {
      skipped.push({
        edit,
        reason: 'that text is not in the file where the lab saw it, or it has been changed already',
      });
    } else jobs.push({ edit, ...found });
  }

  jobs.sort((a, b) => a.line - b.line || b.start - a.start);
  let last = null;
  for (const job of jobs) {
    if (last && last.line === job.line && job.start + job.old.length > last.start) {
      skipped.push({ edit: job.edit, reason: 'it overlaps another edit' });
      continue;
    }
    const line = lines[job.line];
    lines[job.line] =
      line.slice(0, job.start) + job.edit.new + line.slice(job.start + job.old.length);
    applied.push(job.edit);
    last = job;
  }
  return { text: lines.join('\n'), applied, already, skipped };
}

/** The index of the brace that closes the one at `open`, stepping over comments and strings. */
function closingBrace(text, open) {
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    const ch = text.charAt(i);
    if (ch === '/' && text.charAt(i + 1) === '*') {
      const end = text.indexOf('*/', i + 2);
      if (end < 0) return -1;
      i = end + 1;
    } else if (ch === '"' || ch === "'") {
      for (i++; i < text.length && text.charAt(i) !== ch; i++) {
        if (text.charAt(i) === '\\') i++;
      }
    } else if (ch === '{') depth++;
    else if (ch === '}' && --depth === 0) return i;
  }
  return -1;
}

const sameValue = (a, b) =>
  a.trim().toLowerCase().replace(/\s+/g, ' ') === b.trim().toLowerCase().replace(/\s+/g, ' ');

/**
 * Adds custom properties to the `@theme` block that defines the colours, after the last of
 * them. A name that is already there is left alone: `present` when it has the value asked
 * for, `conflicts` when it has another, for someone to decide.
 */
export function addToTheme(text, entries) {
  const open = /@theme\b[^{]*\{/g;
  let block = null;
  for (let m = open.exec(text); m !== null && block === null; m = open.exec(text)) {
    const start = m.index + m[0].length;
    const end = closingBrace(text, start - 1);
    if (end > 0 && text.slice(start, end).includes('--color-')) block = { start, end };
  }
  if (block === null) {
    return {
      text,
      added: [],
      present: [],
      conflicts: [],
      error: 'there is no @theme block with colours in it',
    };
  }

  const inside = text.slice(block.start, block.end);
  // A declaration ends before its line break, a carriage return included.
  const declaration = /^([ \t]*)(--[\w-]+)[ \t]*:[ \t]*([^;\r\n]+);[^\r\n]*$/gm;
  const existing = new Map();
  let anchor = -1;
  let indent = '  ';
  for (let m = declaration.exec(inside); m !== null; m = declaration.exec(inside)) {
    existing.set(m[2], m[3]);
    if (m[2].startsWith('--color-')) {
      anchor = m.index + m[0].length;
      indent = m[1];
    }
  }

  const added = [];
  const present = [];
  const conflicts = [];
  const lines = [];
  for (const entry of entries) {
    const have = existing.get(entry.name);
    if (have === undefined) {
      added.push(entry.name);
      lines.push(
        indent +
          entry.name +
          ': ' +
          entry.value +
          ';' +
          (entry.note ? ' /* ' + entry.note + ' */' : ''),
      );
    } else if (sameValue(have, entry.value)) present.push(entry.name);
    else conflicts.push({ name: entry.name, have, want: entry.value });
  }
  if (lines.length === 0) return { text, added, present, conflicts };

  const eol = lineEnding(text);
  const at = block.start + anchor;
  return {
    text: text.slice(0, at) + eol + lines.join(eol) + text.slice(at),
    added,
    present,
    conflicts,
  };
}

/**
 * Puts a block of text in a file between two marker comments, replacing what was between
 * them if they are there already, so running the script twice leaves one copy.
 */
export function setBlock(text, marker, block) {
  const begin = '/* colour-lab:' + marker + ' begin */';
  const end = '/* colour-lab:' + marker + ' end */';
  const eol = lineEnding(text);
  const body = (begin + '\n' + block.replace(/\n+$/, '') + '\n' + end).split('\n').join(eol);
  const from = text.indexOf(begin);
  const to = text.indexOf(end);
  if (from >= 0 && to > from) return text.slice(0, from) + body + text.slice(to + end.length);
  const trimmed = text.replace(/\s+$/, '');
  return trimmed + eol + eol + body + eol;
}

/** The line ending a text uses, so that what is added to it does not mix two. */
function lineEnding(text) {
  return text.includes('\r\n') ? '\r\n' : '\n';
}

/** `40` or `[0.4]` after the slash of a class, as a fraction. */
function opacityOf(text) {
  const value = text.startsWith('[') ? parseFloat(text.slice(1, -1)) : parseInt(text, 10) / 100;
  return Number.isFinite(value) ? value : 1;
}

/**
 * The pattern for the classes a rule is about: a utility from `rule.prefixes`, then the colour
 * `rule.from`, then perhaps an opacity. Group 1 is the utility, group 2 the opacity.
 */
export function classPattern(rule) {
  const name = rule.from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(
    '(?<![\\w-])(' + rule.prefixes + ')-' + name + '(?:\\/(\\d{1,3}|\\[[\\d.]+\\]))?(?![\\w-])',
    'g',
  );
}

/** Whether a rule covers a class set at this opacity. 1 stands for no opacity at all. */
function covers(rule, opacity) {
  if (rule.alphas === null) return true;
  const alpha = opacity === undefined ? 1 : opacityOf(opacity);
  return rule.alphas.some((a) => Math.abs(a - alpha) < 0.0005);
}

/** Renames the classes a rule covers, to the colour `rule.to`. Returns the new text and how many. */
export function renameClasses(text, rule) {
  let count = 0;
  const next = text.replace(classPattern(rule), (match, prefix, opacity) => {
    if (!covers(rule, opacity)) return match;
    count++;
    const cut = prefix.length + 1;
    return match.slice(0, cut) + rule.to + match.slice(cut + rule.from.length);
  });
  return { text: next, count };
}

/** How many classes a rule covers in a text, for finding the ones the lab did not list. */
export function countClasses(text, rule) {
  let count = 0;
  for (const m of text.matchAll(classPattern(rule))) if (covers(rule, m[2])) count++;
  return count;
}
