import { type Catalogue, type LiteralOccurrence } from '../catalogue/types';
import { type Rgb } from '../colour/convert';
import { type ResolveInput, type Scheme, type SchemeEdits } from '../model/resolve';
import { type SlotKey } from '../model/slots';
import { type Classified, type Verdict } from './classify';
import { type ApplyPlan } from './apply/script';
import { type RoleSplit, type RoleToken } from './roleTokens';

/** What a prompt is made from: the source as it is, the colours as they are, and what was changed. */
export interface PromptInputs {
  catalogue: Catalogue;
  /** The authored value of every var slot, as the page's stylesheets give it. */
  originals: ReadonlyMap<SlotKey, Rgb>;
  defaultLinks: ReadonlyMap<SlotKey, SlotKey>;
  edits: Readonly<Record<Scheme, SchemeEdits>>;
  /** When it was made, for the header. Passed in so the same input always gives the same prompt. */
  generatedAt: Date;
}

export function resolveInputs(inputs: PromptInputs, scheme: Scheme): ResolveInput {
  return {
    scheme,
    originals: inputs.originals,
    defaultLinks: inputs.defaultLinks,
    edits: inputs.edits[scheme],
  };
}

/** A brand token whose value changes, in the place the app defines it. */
export interface TokenChange {
  slot: SlotKey;
  /** `--color-rt-ink`. */
  name: string;
  from: string;
  to: string;
  file: string;
  line: number;
}

/** A Tailwind palette colour the app uses that is to be a different value. */
export interface PaletteChange {
  slot: SlotKey;
  name: string;
  from: string;
  to: string;
}

/** A hardcoded colour at one place, and what it becomes. */
export interface LiteralChange {
  literal: LiteralOccurrence;
  to: string;
  kind: Classified;
}

export interface PlanStats {
  tokens: number;
  palette: number;
  roleTokens: number;
  literals: number;
  refs: number;
  classUses: number;
}

export interface LightPlan {
  apply: ApplyPlan;
  tokens: TokenChange[];
  palette: PaletteChange[];
  roles: RoleSplit;
  literals: LiteralChange[];
  warnings: string[];
  stats: PlanStats;
}

export type { RoleToken };

/** A brand or palette colour that is another colour in the dark theme. */
export interface DarkColour {
  slot: SlotKey;
  /** `--color-rt-ink`. */
  name: string;
  light: Rgb;
  dark: Rgb;
}

/** A hardcoded colour that becomes a variable, which is one colour in a role at an opacity. */
export interface DarkVariable {
  /** `--rt-lit-080c15-shadow-a120`. */
  name: string;
  slot: SlotKey;
  role: string;
  alpha: number;
  /** As CSS: `#ffffff`, or `rgba(8, 12, 21, 0.12)`. */
  light: string;
  dark: string;
}

/** Hardcoded colours the lab would change in the dark theme and the prompt leaves alone, and why. */
export interface KeptGroup {
  file: string;
  verdict: Verdict;
  why: string;
  count: number;
}

export interface DarkPlan {
  apply: ApplyPlan;
  colours: DarkColour[];
  roles: RoleSplit;
  variables: DarkVariable[];
  /** The chrome colours that are replaced by a variable, one for each place. */
  replaced: LiteralChange[];
  kept: KeptGroup[];
  /** The dark copy of the logo, if the logo changes. */
  logo: { from: string; to: string; changes: LiteralChange[] } | null;
  /** The CSS the script writes. */
  css: string;
  /** How many light-theme changes the lab also holds. */
  lightEdits: number;
  warnings: string[];
  stats: {
    colours: number;
    roleTokens: number;
    variables: number;
    replaced: number;
    kept: number;
    classUses: number;
    refs: number;
  };
}
