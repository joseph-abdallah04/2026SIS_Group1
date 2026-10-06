/** One change to a piece of text, found by where the lab saw it and, failing that, by its line. */
export interface TextEdit {
  file: string;
  /** 1-based, as the lab saw it. */
  line: number;
  col: number;
  /** What may stand there now: the app's own text, and any text an earlier prompt left. */
  olds: string[];
  new: string;
  /** Which whole-token occurrence of the old text on its line this is, counting from 0. */
  nth: number;
  /** The line as the lab saw it, trimmed and cut at 160 characters. */
  anchor: string;
}

export interface ThemeEntry {
  name: string;
  value: string;
  note?: string;
}

/** The classes of one colour that move to another: `bg-rt-ink/10` to `bg-rt-ink-fill-soft/10`. */
export interface ClassRule {
  /** The colour as a class names it: `rt-ink`, `red-600`. */
  from: string;
  to: string;
  /** Utility prefixes as a regular expression source: `bg|from|via|to`. */
  prefixes: string;
  /** The opacities it covers as fractions, 1 meaning none. `null` covers any. */
  alphas: number[] | null;
}

export interface Located {
  line: number;
  start: number;
  old: string;
}

export function standsAt(line: string, start: number, text: string): boolean;
export function occurrence(line: string, text: string, nth: number): number;
export function locate(
  lines: string[],
  edit: TextEdit,
  after?: string | null,
): Located | 'already' | null;

export function applyEdits(
  text: string,
  edits: TextEdit[],
): {
  text: string;
  applied: TextEdit[];
  already: TextEdit[];
  skipped: { edit: TextEdit; reason: string }[];
};

export function addToTheme(
  text: string,
  entries: ThemeEntry[],
): {
  text: string;
  added: string[];
  present: string[];
  conflicts: { name: string; have: string; want: string }[];
  error?: string;
};

export function setBlock(text: string, marker: string, block: string): string;
export function classPattern(rule: Pick<ClassRule, 'from' | 'prefixes'>): RegExp;
export function renameClasses(text: string, rule: ClassRule): { text: string; count: number };
export function countClasses(text: string, rule: ClassRule): number;
