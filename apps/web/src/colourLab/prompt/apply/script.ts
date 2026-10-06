import coreSource from './core.js?raw';
import runnerSource from './runner.js?raw';
import { type ClassRule, type TextEdit, type ThemeEntry } from './core';

export type { ClassRule, TextEdit, ThemeEntry } from './core';

/** Everything the apply script is to do. It is data: the script holds the logic. */
export interface ApplyPlan {
  /** Files to copy first, so edits can be made to the copy: the logo's dark twin. */
  copies: { from: string; to: string }[];
  /** Changes to a piece of text at a place in a file. */
  edits: TextEdit[];
  /** Colours to add to the `@theme` block, if there are any. */
  theme: { file: string; entries: ThemeEntry[] } | null;
  /** CSS to write between marker comments, so a second run changes nothing. */
  blocks: { file: string; marker: string; text: string }[];
  /** Classes that move to another colour, with how many the lab counted in each file. */
  classes: {
    rule: ClassRule;
    files: { file: string; expected: number }[];
    /** Every file where the lab saw this colour in this role, at any opacity: the rest are strays. */
    seen: string[];
  }[];
  /** Files the prompt tells the reader to create, which the same class moves apply to. */
  created: string[];
  /** Folders to search for uses of those classes in files the lab has not seen. */
  scan: string[];
  /** Old values to look for in test files afterwards, since a test that asserts one has to change. */
  watch: { old: string; new: string }[];
}

export const EMPTY_PLAN: ApplyPlan = {
  copies: [],
  edits: [],
  theme: null,
  blocks: [],
  classes: [],
  created: [],
  scan: [],
  watch: [],
};

const lf = (text: string): string => text.replace(/\r\n/g, '\n');

/** The plan as JSON a person can read: one edit to a line. */
export function formatPlan(plan: ApplyPlan): string {
  const list = (items: readonly unknown[]): string =>
    items.length === 0
      ? '[]'
      : '[\n' + items.map((i) => '  ' + JSON.stringify(i)).join(',\n') + '\n ]';
  return [
    '{',
    ' "copies": ' + list(plan.copies) + ',',
    ' "edits": ' + list(plan.edits) + ',',
    ' "theme": ' + JSON.stringify(plan.theme) + ',',
    ' "blocks": ' + list(plan.blocks) + ',',
    ' "classes": ' + list(plan.classes) + ',',
    ' "created": ' + JSON.stringify(plan.created) + ',',
    ' "scan": ' + JSON.stringify(plan.scan) + ',',
    ' "watch": ' + list(plan.watch),
    '}',
  ].join('\n');
}

/**
 * One self-contained Node script that carries out a plan: the runner and the text functions it
 * uses, with the plan written in. It needs Node 18 or later and nothing installed, and is run
 * from the root of the repository.
 */
export function renderApplyScript(plan: ApplyPlan): string {
  const imports = lf(runnerSource)
    .split('\n')
    .filter((line) => /^import (fs|path) from /.test(line))
    .join('\n');
  const core = lf(coreSource)
    .replace(/^(\/\/[^\n]*\n)+\n/, '')
    .replace(/^export /gm, '');
  const body = lf(runnerSource)
    .replace(/^\/\* global[^\n]*\n/, '')
    .replace(/^\/\/ The part of the Colour Lab apply script that reads[^\n]*\n(\/\/[^\n]*\n)*/, '')
    .replace(/^import [^\n]*\n/gm, '')
    .replace('/*PLAN*/ null', formatPlan(plan));
  return [
    '// Colour Lab apply script. Run from the root of the repository: node colour-lab-apply.mjs',
    '// Add --check first to see what it would do without writing anything.',
    imports,
    '',
    '// ---- text functions',
    core.trim(),
    '',
    '// ---- the plan, and what is done with it',
    body.trim(),
    '',
  ].join('\n');
}
