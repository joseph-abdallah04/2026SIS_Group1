import { originalOf, resolveSlot } from '../model/resolve';
import { slotKind } from '../model/slots';
import { type ApplyPlan, type TextEdit, type ThemeEntry } from './apply/script';
import { classify } from './classify';
import {
  type LightPlan,
  type LiteralChange,
  type PaletteChange,
  type PromptInputs,
  type TokenChange,
  resolveInputs,
} from './inputs';
import { colourName, refEdits, splitByRole } from './roleTokens';
import { editAt, hex6, nthOnLine, rgbOfRaw, sameRgb, textFor } from './values';

/** The folders that the apply script searches for uses of a class the lab did not list. */
export const SCAN_DIRS = ['apps/web/src', 'packages/shared/src'];

/** The old values a test might hold, each with what it is now, so that tests that assert them can be found. */
export function watched(edits: readonly TextEdit[]): { old: string; new: string }[] {
  const seen = new Map<string, string>();
  for (const edit of edits) {
    const old = edit.olds[0];
    if (old && !old.startsWith('var(') && !seen.has(old.toLowerCase()))
      seen.set(old.toLowerCase(), old);
  }
  return [...seen.values()].map((old) => ({
    old,
    new: edits.find((e) => e.olds[0] === old)?.new ?? '',
  }));
}

/** The file the brand colours are defined in, as far as the catalogue says. */
const themeFile = (inputs: PromptInputs): string =>
  inputs.catalogue.tokens[0]?.file ?? 'apps/web/src/index.css';

/**
 * What the light theme asks for, relative to the app as it is on main.
 *
 * A change is only listed where a colour ends up different from what the source says now, so a
 * colour that was edited and then put back, or a copy that was told to stay as it is, costs nothing.
 */
export function planLight(inputs: PromptInputs): LightPlan {
  const { catalogue } = inputs;
  const light = resolveInputs(inputs, 'light');
  const warnings: string[] = [];
  const edits: TextEdit[] = [];
  const theme: ThemeEntry[] = [];

  // Brand tokens: the value on the line that defines them.
  const tokens: TokenChange[] = [];
  for (const token of catalogue.tokens) {
    const now = resolveSlot(token.slot, 'other', light);
    const was = rgbOfRaw(token.value);
    if (!now || !was) {
      if (!was)
        warnings.push(`The value of ${token.name} (${token.value}) could not be read as a colour.`);
      continue;
    }
    if (sameRgb(now, was.rgb)) continue;
    const to = textFor(now, was.alpha, token.value);
    tokens.push({
      slot: token.slot,
      name: token.name,
      from: token.value,
      to,
      file: token.file,
      line: token.line,
    });
    edits.push(editAt({ ...token, raw: token.value }, [token.value], to, 0));
  }

  // Tailwind palette colours: not defined in the repository, so they are added to the theme.
  const palette: PaletteChange[] = [];
  for (const slot of [...light.originals.keys()].filter((s) => slotKind(s) === 'tw')) {
    const now = resolveSlot(slot, 'other', light);
    const was = originalOf(slot, light);
    const name = colourName(slot);
    if (!now || !was || !name || sameRgb(now, was)) continue;
    palette.push({ slot, name: `--color-${name}`, from: hex6(was), to: hex6(now) });
    theme.push({
      name: `--color-${name}`,
      value: hex6(now),
      note: `was ${hex6(was)} (Tailwind's own)`,
    });
  }

  // Colours that are set apart by role: new theme colours, and the places that use them moved.
  const roles = splitByRole(catalogue, light, null);
  for (const token of roles.tokens) {
    theme.push({
      name: `--color-${token.name}`,
      value: hex6(token.light),
      note: `${token.slot.slice(token.slot.indexOf(':') + 1)} as ${token.role}`,
    });
  }
  edits.push(...refEdits(roles.refs, catalogue));

  // Hardcoded colours: each place, in the syntax it was written in.
  const literals: LiteralChange[] = [];
  for (const literal of catalogue.literals) {
    // A colour with no opacity shows nothing, and the lab leaves it alone, so it is left alone here.
    if (literal.alpha === 0) continue;
    const was = rgbOfRaw(literal.raw);
    if (!was) {
      warnings.push(
        `${literal.file}:${literal.line} ${literal.raw} could not be read as a colour.`,
      );
      continue;
    }
    const now = resolveSlot(literal.slot, literal.role, light, literal.alpha);
    if (!now || sameRgb(now, was.rgb)) continue;
    const to = textFor(now, literal.alpha, literal.raw);
    literals.push({ literal, to, kind: classify(literal) });
    edits.push(editAt(literal, [literal.raw], to, nthOnLine(literal, catalogue.literals)));
  }

  const apply: ApplyPlan = {
    copies: [],
    edits,
    theme: theme.length > 0 ? { file: themeFile(inputs), entries: theme } : null,
    blocks: [],
    classes: roles.classes.map(({ rule, files, seen }) => ({ rule, files, seen })),
    created: [],
    scan: SCAN_DIRS,
    watch: watched(edits),
  };

  return {
    apply,
    tokens,
    palette,
    roles,
    literals,
    warnings,
    stats: {
      tokens: tokens.length,
      palette: palette.length,
      roleTokens: roles.tokens.length,
      literals: literals.length,
      refs: roles.refs.length,
      classUses: roles.classes.reduce(
        (sum, move) => sum + move.files.reduce((n, f) => n + f.expected, 0),
        0,
      ),
    },
  };
}
