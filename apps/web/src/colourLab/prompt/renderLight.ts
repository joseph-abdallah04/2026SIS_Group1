import { labelForSlot } from '../model/brand';
import { renderApplyScript } from './apply/script';
import { after, dayOf, header, howColoursWork, rules } from './format';
import { type LightPlan, type LiteralChange, type PromptInputs } from './inputs';
import { planLight } from './planLight';
import { type RoleSplit, colourName } from './roleTokens';
import { stateOf, stateSection } from './state';
import { hex6 } from './values';

export interface PromptResult {
  kind: 'light' | 'dark';
  text: string;
  /** A name for the file it is saved as. */
  filename: string;
  /** Whether there is nothing in it to apply. */
  empty: boolean;
  /** What it holds, in a line each, for the lab to show before it is saved. */
  summary: string[];
  warnings: string[];
}

const plural = (n: number, one: string, many = `${one}s`): string => `${n} ${n === 1 ? one : many}`;

/** The opacities a role colour serves, in words: `10% or none`. */
export function opacityWords(alphas: readonly number[]): string {
  return alphas.map((a) => (a >= 0.9995 ? 'none' : `${Math.round(a * 1000) / 10}%`)).join(' or ');
}

function byFile(changes: readonly LiteralChange[]): Map<string, LiteralChange[]> {
  const files = new Map<string, LiteralChange[]>();
  for (const change of [...changes].sort(
    (a, b) =>
      a.literal.file.localeCompare(b.literal.file) ||
      a.literal.line - b.literal.line ||
      a.literal.col - b.literal.col,
  )) {
    files.set(change.literal.file, [...(files.get(change.literal.file) ?? []), change]);
  }
  return files;
}

/** The role colours, and the classes and references that move to them. */
export function roleLines(roles: RoleSplit): string[] {
  if (roles.tokens.length === 0) return [];
  const lines = [
    '### Colours set apart by role',
    '',
    'These colours are one thing as a fill and another as text, a border or a shadow, so each such role gets a theme colour of its own and the places that use the colour in that role move to it. Add each to the `@theme` block (the script does this), then move the uses.',
    '',
  ];
  for (const token of roles.tokens) {
    const from = colourName(token.slot) ?? token.slot;
    lines.push(
      `- \`--color-${token.name}: ${hex6(token.light)};\` — \`${from}\` as a ${token.role}, used with opacity ${opacityWords(token.alphas)}.`,
    );
    const move = roles.classes.find((m) => m.token === token);
    if (move) {
      lines.push(
        `  - Classes: rename \`(${move.rule.prefixes})-${from}\` to \`…-${token.name}\`, keeping any \`/opacity\`, but only where the opacity is ${opacityWords(token.alphas)}. In: ${move.files.map((f) => `\`${f.file}\` ×${f.expected}`).join(', ')}.`,
      );
    }
    const refs = roles.refs.filter((r) => r.token === token);
    if (refs.length > 0) {
      lines.push(
        `  - \`var(--color-${from})\` becomes \`var(--color-${token.name})\` at: ${refs.map((r) => `\`${r.ref.file}:${r.ref.line}\``).join(', ')}.`,
      );
    }
  }
  lines.push('');
  return lines;
}

export function summaryOf(plan: LightPlan): string[] {
  const out: string[] = [];
  const { stats } = plan;
  if (stats.tokens)
    out.push(
      `${plural(stats.tokens, 'brand colour')} ${stats.tokens === 1 ? 'changes' : 'change'} value`,
    );
  if (stats.palette)
    out.push(
      `${plural(stats.palette, 'Tailwind palette colour')} ${stats.palette === 1 ? 'is' : 'are'} defined`,
    );
  if (stats.roleTokens) {
    out.push(
      `${plural(stats.roleTokens, 'new theme colour')} for colours set apart by role (${plural(stats.classUses, 'class use')} and ${plural(stats.refs, 'var() reference')} move to them)`,
    );
  }
  if (stats.literals) {
    const files = new Set(plan.literals.map((l) => l.literal.file)).size;
    const exports = plan.literals.filter((l) => l.kind.verdict === 'export').length;
    out.push(
      `${plural(stats.literals, 'hardcoded colour')} ${stats.literals === 1 ? 'changes' : 'change'}, in ${plural(files, 'file')}${exports ? ` (${exports} only in exports)` : ''}`,
    );
  }
  return out;
}

/** The light prompt: what to change so the light theme is what the lab shows. */
export function buildLightPrompt(inputs: PromptInputs): PromptResult {
  const plan = planLight(inputs);
  const { git } = inputs.catalogue;
  const summary = summaryOf(plan);
  const filename = `roundtable-colours-light-${dayOf(inputs.generatedAt)}.txt`;
  const empty =
    plan.apply.edits.length === 0 && plan.apply.theme === null && plan.apply.classes.length === 0;

  const text: string[] = [...header('light', git, inputs.generatedAt)];
  if (empty) {
    text.push('There are no light-theme changes in the lab. Nothing to do.', '');
    return {
      kind: 'light',
      text: text.join('\n'),
      filename,
      empty,
      summary,
      warnings: plan.warnings,
    };
  }

  text.push(
    'A teammate tried new colours for RoundTable in the Colour Lab, a floating widget that edits every colour the app uses, live. This document lists the **light theme** colours they settled on, as exact changes. Make them, so that the app looks as it did in the lab.',
    '',
    '## What changes',
    '',
    ...summary.map((line) => `- ${line}.`),
    '',
    ...howColoursWork(),
    ...rules('light', git),
    '## The script',
    '',
    'Most of the work is mechanical, so it is done by one script, given at the end of this document. Save it as `colour-lab-apply.mjs` in the repository root, then:',
    '',
    '```',
    'node colour-lab-apply.mjs --check   # reads and reports, writes nothing',
    'node colour-lab-apply.mjs           # makes the changes',
    '```',
    '',
    'Its report has one line for each thing it did: `APPLIED`, `ALREADY` (done before), `SKIPPED` with the reason, `THEME` for a colour added to `@theme`, `CONFLICT` where the repository already has a different value, `CLASSES` with a count to compare, and `STRAY` for a use of a class in a file the lab never saw, which you handle the same way. Delete the script when you are done. Running it twice changes nothing the second time.',
    '',
    '## The changes, for reading',
    '',
    'This is what the script does, in full, for checking it and for doing it by hand if it cannot run.',
    '',
  );

  if (plan.tokens.length > 0) {
    text.push(
      '### Brand colours',
      '',
      `In \`${plan.tokens[0]?.file}\`, in the \`@theme\` block:`,
      '',
    );
    for (const t of plan.tokens) {
      text.push(
        `- line ${t.line}: \`${t.name}: ${t.from};\` → \`${t.name}: ${t.to};\` (${labelForSlot(t.slot).label})`,
      );
    }
    text.push('');
  }
  if (plan.palette.length > 0) {
    text.push(
      '### Tailwind palette colours',
      '',
      `Not defined in the repository, so add each to the \`@theme\` block in \`${plan.apply.theme?.file ?? 'apps/web/src/index.css'}\` (if it is already defined there, change the value):`,
      '',
    );
    for (const p of plan.palette)
      text.push(`- \`${p.name}: ${p.to};\` (Tailwind’s own is ${p.from})`);
    text.push('');
  }
  text.push(...roleLines(plan.roles));

  if (plan.literals.length > 0) {
    text.push(
      '### Hardcoded colours',
      '',
      'Each is `line:column`, the text now there, and the text it becomes. Where one line has several, the column says which.',
      '',
    );
    for (const [file, changes] of byFile(plan.literals)) {
      text.push(`#### \`${file}\``, '');
      for (const c of changes) {
        const note = c.kind.verdict === 'export' ? ' (export)' : '';
        text.push(
          `- ${c.literal.line}:${c.literal.col}  \`${c.literal.raw}\` → \`${c.to}\`${note}  — ${c.literal.context}`,
        );
      }
      text.push('');
    }
  }

  const olds = [
    ...new Set([...plan.tokens.map((t) => t.from), ...plan.literals.map((l) => l.literal.raw)]),
  ].sort();
  text.push(...after(olds, 'light'));

  if (plan.warnings.length > 0) {
    text.push('## Things the lab could not read', '', ...plan.warnings.map((w) => `- ${w}`), '');
  }

  text.push('## The script file', '', '```js', renderApplyScript(plan.apply).trimEnd(), '```', '');
  text.push(...stateSection(stateOf(inputs.edits, git, inputs.generatedAt)));

  return {
    kind: 'light',
    text: text.join('\n'),
    filename,
    empty,
    summary,
    warnings: plan.warnings,
  };
}
