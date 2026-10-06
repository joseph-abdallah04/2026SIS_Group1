import { type SlotKey } from '../model/slots';

/**
 * What a colour is doing where it is used. A colour that is text on one page is
 * a background on another, and wants a different value in a dark theme, so each
 * role can be set apart. `image` is a colour inside an SVG shown as a picture.
 */
export type Role = 'text' | 'fill' | 'border' | 'shadow' | 'image' | 'other';

/** A colour written straight into the source, in any syntax. */
export interface LiteralOccurrence {
  /** hex:#rrggbb of the colour, whatever it was written as. */
  slot: SlotKey;
  /** Repo-relative, forward slashes. */
  file: string;
  /** 1-based. */
  line: number;
  col: number;
  /** Exactly as written: #F1C881, rgba(8,12,21,0.12), oklch(...). */
  raw: string;
  alpha: number;
  role: Role;
  /** A selector, a constant, a prop: enough to recognise the place. */
  context: string;
  /** The source line, trimmed. */
  snippet: string;
  /** Only drawn into exports (the recap PDF, previews), never into the live UI. */
  exportOnly: boolean;
  /**
   * Set when the colour is the whole value of a Tailwind class, as in `bg-[#f7f4ee]`. Written as a
   * variable it needs a type hint, `bg-[color:var(--x)]`, or Tailwind cannot tell it from an image.
   */
  colourClass?: true;
}

/**
 * How often a file uses a brand token or Tailwind palette colour through a class,
 * at one opacity: `bg-rt-ink/10` and `bg-rt-ink` are counted apart, since a dark
 * theme can want a different colour for a wash than for a solid.
 */
export interface ClassUse {
  slot: SlotKey;
  file: string;
  role: Role;
  /** The opacity the class sets, as a fraction. 1 when it sets none. */
  alpha: number;
  count: number;
}

/** A place that reads a token or palette colour with `var(--color-…)`, rather than a class. */
export interface VarRef {
  slot: SlotKey;
  file: string;
  /** 1-based. */
  line: number;
  col: number;
  /** The whole expression as written: `var(--color-rt-ink)`. */
  raw: string;
  /** The custom property it reads: `--color-rt-ink`. */
  name: string;
  /** The opacity `color-mix` gives it, or 1. */
  alpha: number;
  role: Role;
  context: string;
  snippet: string;
}

/** A token declared in the @theme block. */
export interface TokenDef {
  slot: SlotKey;
  /** --color-rt-ink */
  name: string;
  /** As written: #080c15. */
  value: string;
  file: string;
  line: number;
  /** Where the value starts on its line, 1-based, and the line itself, trimmed. */
  col: number;
  snippet: string;
}

export interface GitInfo {
  sha: string | null;
  branch: string | null;
  /** Where this branch left main, so a prompt can say what it was written against. */
  mergeBase: string | null;
}

export interface FileScan {
  literals: LiteralOccurrence[];
  classes: ClassUse[];
  refs: VarRef[];
  tokens: TokenDef[];
}

export interface Catalogue {
  generatedAt: number;
  git: GitInfo;
  tokens: TokenDef[];
  literals: LiteralOccurrence[];
  classes: ClassUse[];
  refs: VarRef[];
}

export const EMPTY_CATALOGUE: Catalogue = {
  generatedAt: 0,
  git: { sha: null, branch: null, mergeBase: null },
  tokens: [],
  literals: [],
  classes: [],
  refs: [],
};
