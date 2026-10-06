/* global process, console */
// The part of the Colour Lab apply script that reads and writes files. The lab puts the plan in
// where it says PLAN and puts core.js in front, so what a prompt carries is one file.
import fs from 'node:fs';
import path from 'node:path';
import { addToTheme, applyEdits, countClasses, renameClasses, setBlock } from './core.js';

const PLAN = /*PLAN*/ null;

const check = process.argv.includes('--check');
const root = process.cwd();
const out = [];
const tally = {
  applied: 0,
  already: 0,
  skipped: 0,
  added: 0,
  conflicts: 0,
  mismatches: 0,
  strays: 0,
  tests: 0,
};

const absolute = (file) => path.join(root, file);
const files = new Map();

function read(file) {
  if (files.has(file)) return files.get(file);
  let text = null;
  try {
    text = fs.readFileSync(absolute(file), 'utf8');
  } catch {
    text = null;
  }
  files.set(file, text);
  return text;
}

const write = (file, text) => files.set(file, text);

// 0. Copies, so that the edits can be made to the copy. A copy that is there already is left alone.
for (const copy of PLAN.copies) {
  if (read(copy.to) !== null) {
    out.push('COPY     ' + copy.to + ' is already there');
    continue;
  }
  const source = read(copy.from);
  if (source === null) {
    out.push(
      'SKIPPED  ' + copy.from + '  (the file is not on this branch: ' + copy.to + ' not made)',
    );
    tally.skipped++;
    continue;
  }
  write(copy.to, source);
  out.push('COPY     ' + copy.from + ' -> ' + copy.to);
}

// 1. Edits at a place in a file. First, so that the places are still where the lab saw them.
const byFile = new Map();
for (const edit of PLAN.edits) {
  if (!byFile.has(edit.file)) byFile.set(edit.file, []);
  byFile.get(edit.file).push(edit);
}
for (const [file, edits] of byFile) {
  const text = read(file);
  if (text === null) {
    for (const edit of edits) {
      out.push(
        'SKIPPED  ' +
          file +
          ':' +
          edit.line +
          ':' +
          edit.col +
          '  ' +
          edit.olds[0] +
          ' -> ' +
          edit.new +
          '   (the file is not on this branch)',
      );
      tally.skipped++;
    }
    continue;
  }
  const result = applyEdits(text, edits);
  write(file, result.text);
  tally.applied += result.applied.length;
  tally.already += result.already.length;
  for (const edit of result.applied) {
    out.push(
      'APPLIED  ' +
        file +
        ':' +
        edit.line +
        ':' +
        edit.col +
        '  ' +
        edit.olds[0] +
        ' -> ' +
        edit.new,
    );
  }
  for (const edit of result.already) {
    out.push('ALREADY  ' + file + ':' + edit.line + ':' + edit.col + '  ' + edit.new);
  }
  for (const { edit, reason } of result.skipped) {
    out.push(
      'SKIPPED  ' +
        file +
        ':' +
        edit.line +
        ':' +
        edit.col +
        '  ' +
        edit.olds[0] +
        ' -> ' +
        edit.new +
        '   (' +
        reason +
        ')',
    );
    tally.skipped++;
  }
}

// 2. New colours in the @theme block.
if (PLAN.theme && PLAN.theme.entries.length > 0) {
  const text = read(PLAN.theme.file);
  if (text === null) {
    out.push(
      'SKIPPED  ' +
        PLAN.theme.file +
        '  (the file is not on this branch: ' +
        PLAN.theme.entries.length +
        ' theme colours not added)',
    );
    tally.skipped += PLAN.theme.entries.length;
  } else {
    const result = addToTheme(text, PLAN.theme.entries);
    if (result.error) {
      out.push('SKIPPED  ' + PLAN.theme.file + '  (' + result.error + ')');
      tally.skipped += PLAN.theme.entries.length;
    } else write(PLAN.theme.file, result.text);
    for (const name of result.added) out.push('THEME    + ' + name);
    for (const name of result.present)
      out.push('THEME    = ' + name + ' (already there with that value)');
    for (const c of result.conflicts) {
      out.push(
        'CONFLICT ' +
          c.name +
          ' is already ' +
          c.have +
          ' and the lab wants ' +
          c.want +
          ': decide which stands',
      );
      tally.conflicts++;
    }
    tally.added += result.added.length;
  }
}

// 3. Blocks of CSS, each between two marker comments.
for (const block of PLAN.blocks) {
  const text = read(block.file);
  if (text === null) {
    out.push(
      'SKIPPED  ' +
        block.file +
        '  (the file is not on this branch: block ' +
        block.marker +
        ' not written)',
    );
    tally.skipped++;
    continue;
  }
  const next = setBlock(text, block.marker, block.text);
  write(block.file, next);
  out.push(
    'BLOCK    ' + block.marker + (next === text ? ' is already in ' : ' written to ') + block.file,
  );
}

// 4. Classes that move to another colour.
for (const entry of PLAN.classes) {
  for (const { file, expected } of entry.files) {
    const text = read(file);
    if (text === null) {
      out.push(
        'SKIPPED  ' +
          file +
          '  (the file is not on this branch: ' +
          expected +
          ' x ' +
          entry.rule.from +
          ' not renamed)',
      );
      tally.skipped++;
      continue;
    }
    const result = renameClasses(text, entry.rule);
    write(file, result.text);
    // Run before, the classes are in their new colour already.
    const done = countClasses(text, { ...entry.rule, from: entry.rule.to });
    if (result.count === 0 && expected > 0 && done >= expected) {
      out.push(
        'CLASSES  ' +
          file +
          '  ' +
          entry.rule.from +
          ' -> ' +
          entry.rule.to +
          '  already done (x' +
          done +
          ')',
      );
      continue;
    }
    const ok = result.count === expected;
    if (!ok) tally.mismatches++;
    out.push(
      'CLASSES  ' +
        file +
        '  ' +
        entry.rule.from +
        ' -> ' +
        entry.rule.to +
        '  x' +
        result.count +
        ' (expected ' +
        expected +
        ')' +
        (ok ? '' : '  MISMATCH'),
    );
  }
}

// 4b. Files this prompt tells the reader to create take the same moves. There is no count to compare.
for (const file of PLAN.created) {
  if (read(file) === null) {
    out.push(
      'SKIPPED  ' +
        file +
        '  (not there yet: create it first, as the prompt says, then run this again)',
    );
    tally.skipped++;
    continue;
  }
  for (const entry of PLAN.classes) {
    const result = renameClasses(read(file), entry.rule);
    if (result.count === 0) continue;
    write(file, result.text);
    out.push(
      'CLASSES  ' +
        file +
        '  ' +
        entry.rule.from +
        ' -> ' +
        entry.rule.to +
        '  x' +
        result.count +
        ' (a file this prompt creates)',
    );
  }
}

// 5. Write, unless this is only a check.
let changed = 0;
for (const [file, text] of files) {
  if (text === null) continue;
  let before = null;
  try {
    before = fs.readFileSync(absolute(file), 'utf8');
  } catch {
    before = null;
  }
  if (before === text) continue;
  changed++;
  if (!check) fs.writeFileSync(absolute(file), text);
}

// 6. The classes the lab did not list, in files it has not seen: found, not changed.
const listed = new Set();
for (const entry of PLAN.classes) for (const { file } of entry.files) listed.add(file);
function* walk(dir) {
  let entries = [];
  try {
    entries = fs.readdirSync(absolute(dir), { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const rel = dir + '/' + entry.name;
    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules' && entry.name !== 'dist' && entry.name !== 'colourLab')
        yield* walk(rel);
    } else if (/\.(tsx?|css)$/.test(entry.name)) yield rel;
  }
}
if (PLAN.classes.length > 0) {
  for (const dir of PLAN.scan) {
    for (const file of walk(dir)) {
      let text = '';
      try {
        text =
          files.has(file) && files.get(file) !== null
            ? files.get(file)
            : fs.readFileSync(absolute(file), 'utf8');
      } catch {
        continue;
      }
      for (const entry of PLAN.classes) {
        if (entry.seen.includes(file)) continue;
        // Any opacity: a use the lab has not seen may be at one it did not list.
        const left = countClasses(text, { ...entry.rule, alphas: null });
        if (left > 0) {
          const isTest = /\.test\.[tj]sx?$/.test(file);
          const what = isTest
            ? ': a test that names this colour as a class. Where it checks a use that moved to ' +
              entry.rule.to +
              ', change what it expects'
            : ': the lab has not seen this use. If it is one of the kind that moved to ' +
              entry.rule.to +
              ' (see the list), move it too';
          out.push(
            (isTest ? 'TEST     ' : 'STRAY    ') +
              file +
              '  ' +
              left +
              ' x ' +
              entry.rule.from +
              what,
          );
          tally.strays += left;
        }
      }
    }
  }
}

// 7. Tests that hold a value that has just changed: found, not changed.
if (PLAN.watch.length > 0) {
  for (const dir of PLAN.scan) {
    for (const file of walk(dir)) {
      if (!/\.test\.[tj]sx?$/.test(file)) continue;
      let text = '';
      try {
        text = fs.readFileSync(absolute(file), 'utf8');
      } catch {
        continue;
      }
      text.split('\n').forEach((line, index) => {
        const lower = line.toLowerCase();
        for (const watched of PLAN.watch) {
          if (!lower.includes(watched.old.toLowerCase())) continue;
          out.push(
            'TEST     ' +
              file +
              ':' +
              (index + 1) +
              '  has ' +
              watched.old +
              ', which is now ' +
              watched.new,
          );
          tally.tests++;
        }
      });
    }
  }
}

console.log('Colour Lab apply' + (check ? ' (check only: nothing written)' : ''));
console.log(out.join('\n'));
console.log(
  'SUMMARY  applied ' +
    tally.applied +
    ', already done ' +
    tally.already +
    ', skipped ' +
    tally.skipped +
    ', theme colours added ' +
    tally.added +
    ', conflicts ' +
    tally.conflicts +
    ', class mismatches ' +
    tally.mismatches +
    ', unlisted class uses ' +
    tally.strays +
    ', tests holding an old value ' +
    tally.tests +
    ', files ' +
    (check ? 'that would change ' : 'changed ') +
    changed,
);
