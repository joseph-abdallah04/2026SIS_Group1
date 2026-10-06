import { type Rgb } from '../colour/convert';
import { type GitInfo } from '../catalogue/types';
import { hex6 } from './values';

/** The pieces the light and the dark prompt are both made of. Written for a reader with nothing else to go on. */

export type Kind = 'light' | 'dark';

const short = (sha: string | null): string => (sha ? sha.slice(0, 7) : 'unknown');

/** `6 October 2026, 14:32 UTC`, from a date, in a way that does not depend on the machine's locale. */
export function stamp(date: Date): string {
  const months = [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
  ];
  const two = (n: number): string => String(n).padStart(2, '0');
  return `${date.getUTCDate()} ${months[date.getUTCMonth()]} ${date.getUTCFullYear()}, ${two(date.getUTCHours())}:${two(date.getUTCMinutes())} UTC`;
}

/** `2026-10-06`, for a file name. */
export const dayOf = (date: Date): string => date.toISOString().slice(0, 10);

export function header(kind: Kind, git: GitInfo, date: Date): string[] {
  const where = git.sha
    ? `branch \`${git.branch ?? 'unknown'}\` at commit \`${short(git.sha)}\`${git.mergeBase ? ` (it left \`main\` at \`${short(git.mergeBase)}\`)` : ''}`
    : 'a working tree that was not under git';
  return [
    `# RoundTable colour change: ${kind} theme`,
    '',
    `Made by the Colour Lab, a developer tool, on ${stamp(date)}, from ${where}.`,
    'You are working in the RoundTable repository, on `main` or a branch of it. This document is the whole brief: you need nothing else, and there is nobody to ask.',
    '',
  ];
}

/** How colour is built in this repository, so that a list of changes makes sense. */
export function howColoursWork(): string[] {
  return [
    '## How colours are built here',
    '',
    '- **Brand colours** are CSS custom properties in the `@theme` block of `apps/web/src/index.css`, such as `--color-rt-ink: #080c15;`. Tailwind CSS 4 makes classes from them (`text-rt-ink`, `bg-rt-ink/10`, `border-rt-ink`), and some hand-written CSS reads them with `var(--color-rt-ink)`.',
    '- **Tailwind palette colours** (`white`, `black`, `red-50` to `red-700`) are used too. The repository does not define them; Tailwind’s own defaults do. To change one, define it in `@theme`.',
    '- **Hardcoded colours** are written straight into CSS, TypeScript and SVG, in several syntaxes (`#f1c881`, `rgba(8, 12, 21, 0.12)`, `oklch(...)`). A copy of a brand colour follows it, so those copies are listed too.',
    '- **Server code** (`apps/server`) holds copies that are only drawn into exports (the recap PDF, previews). They are listed and marked *export*.',
    '- A colour can be one thing as **text** and another as a **fill**, a **border** or a **shadow**. Where that matters the document says which.',
    '',
  ];
}

export function rules(kind: Kind, git: GitInfo): string[] {
  const at = git.sha ? `commit ${short(git.sha)}` : 'the lab’s checkout';
  return [
    '## Rules',
    '',
    '1. Make the changes in this document and no others. Do not tidy, rename or refactor anything, and do not touch a colour that is not listed.',
    '2. Keep each colour’s syntax, case, spacing and opacity exactly as the document gives it. A Tailwind class cannot contain a space, so `rgba(8,12,21,0.14)` inside `shadow-[…]` must stay without them.',
    `3. Line and column numbers are from ${at}. \`main\` may have moved: find the text by the line shown. If it is not on \`main\` (the lab’s branch can carry commits \`main\` does not), skip it and list it in your report as "not on main".`,
    '4. Use the script for the mechanical part: read its `--check` report first, then run it for real. If it cannot run, make the same changes by hand from the list.',
    '5. Keep LF line endings. Run `npx prettier --write` on every file you changed.',
    '6. Do not commit, push or create a branch unless you are asked to separately.',
    '7. Then run `npm run typecheck`, `npm run lint` and `npm run test`. A test that asserts an old colour may be updated to the new one **only** for a change listed here. Never loosen a contrast or accessibility test (for example in `diagramStyle.test.ts`): if one fails because of a new colour, leave it failing and report it.',
    kind === 'dark'
      ? '8. Where this document says to use judgement, use it, and say in your report what you decided and why. Where it does not, do not guess: if something does not fit, report it.'
      : '8. If something does not fit (a conflict, a count that is not the one given, a colour used somewhere new), do not guess: report it.',
    '',
  ];
}

/** What to do once the changes are made, and what to report. */
export function after(oldValues: readonly string[], kind: Kind): string[] {
  const lines = [
    '## When the changes are made',
    '',
    '1. `git diff --stat` should show the files named in this document and no others.',
    '2. Run `npm run typecheck`, `npm run lint`, `npm run test` and `npx prettier --check` on the changed files. Fix only what a listed change broke.',
  ];
  if (oldValues.length > 0) {
    lines.push(
      '3. Search the repository (`apps`, `packages`, `docs`) for the old values below. A match is not necessarily wrong, since something else can share a value, but say what each one is.',
      '',
      '```',
      ...oldValues,
      '```',
    );
  }
  lines.push(
    '',
    '## Report',
    '',
    'End with a short report:',
    '',
    '- how many changes were made, and the script’s `SUMMARY` line;',
    '- everything skipped, with the reason (not on `main`, text not found, count differs);',
    '- every test you changed, and every test that still fails;',
    `- anything you did that this document did not ask for${kind === 'dark' ? ', and each place you used judgement' : ''}, and anything that surprised you.`,
    '',
  );
  return lines;
}

/** A colour as `#rrggbb` for a table. */
export const colourCell = (rgb: Rgb | null): string => (rgb ? hex6(rgb) : '–');
