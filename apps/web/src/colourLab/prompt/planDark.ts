import { type Rgb } from '../colour/convert';
import { formatCss } from '../colour/parse';
import { resolveSlot } from '../model/resolve';
import { type SlotKey, slotKind } from '../model/slots';
import { type TextEdit, type ThemeEntry } from './apply/script';
import { classify } from './classify';
import { INFRA_FILES } from './infra';
import { type DarkProperty, darkCss } from './darkCss';
import {
  type DarkColour,
  type DarkPlan,
  type DarkVariable,
  type KeptGroup,
  type LiteralChange,
  type PromptInputs,
  resolveInputs,
} from './inputs';
import { SCAN_DIRS, planLight } from './planLight';
import { colourName, refEdits, splitByRole } from './roleTokens';
import { editAt, hex6, nthOnLine, rgbOfRaw, sameRgb, textFor } from './values';

/** The marker that names the dark block in the stylesheet, so a second run replaces it. */
export const DARK_MARKER = 'dark-theme';

const themeFile = (inputs: PromptInputs): string =>
  inputs.catalogue.tokens[0]?.file ?? 'apps/web/src/index.css';

/** `-a120` for a colour at 12%, and nothing for one that is solid. */
const alphaSuffix = (alpha: number): string => (alpha < 1 ? `-a${Math.round(alpha * 1000)}` : '');

/** The name of the variable for a hardcoded colour in a role at an opacity. */
export const variableName = (slot: SlotKey, role: string, alpha: number): string =>
  `--rt-lit-${slot.replace(/^hex:#/, '')}-${role}${alphaSuffix(alpha)}`;

/** The dark copy of the logo sits beside it. */
const darkTwin = (file: string): string => file.replace(/\.svg$/, '-dark.svg');

/**
 * What a dark theme asks for, as the lab shows it.
 *
 * Brand and palette colours are set on the root for the dark theme, a colour used in a role the lab
 * has told apart gets a theme colour for that role, and a hardcoded colour that is part of the
 * app's own surfaces becomes a variable with a light value and a dark one. What is paper, or is
 * drawn into a file, or is read by code, is left as it is, and the prompt says which.
 */
export function planDark(inputs: PromptInputs): DarkPlan {
  const { catalogue } = inputs;
  const light = resolveInputs(inputs, 'light');
  const dark = resolveInputs(inputs, 'dark');
  const warnings: string[] = [];
  const edits: TextEdit[] = [];
  const theme: ThemeEntry[] = [];
  const copies: { from: string; to: string }[] = [];

  // Brand and palette colours: those that are another colour in the dark.
  const colours: DarkColour[] = [];
  const slots: SlotKey[] = [
    ...catalogue.tokens.map((t) => t.slot),
    ...[...light.originals.keys()].filter((s) => slotKind(s) === 'tw').sort(),
  ];
  for (const slot of slots) {
    const name = colourName(slot);
    const l = resolveSlot(slot, 'other', light);
    const d = resolveSlot(slot, 'other', dark);
    if (!name || !l || !d || sameRgb(l, d)) continue;
    colours.push({ slot, name: `--color-${name}`, light: l, dark: d });
  }

  // Colours set apart by role.
  const roles = splitByRole(catalogue, light, dark);
  for (const token of roles.tokens) {
    theme.push({
      name: `--color-${token.name}`,
      value: hex6(token.light),
      note: `${colourName(token.slot)} as ${token.role}`,
    });
  }
  edits.push(...refEdits(roles.refs, catalogue));

  // Hardcoded colours.
  const variables = new Map<string, DarkVariable>();
  const replaced: LiteralChange[] = [];
  const kept = new Map<string, KeptGroup>();
  const logo: NonNullable<DarkPlan['logo']> = { from: '', to: '', changes: [] };

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
    const l = resolveSlot(literal.slot, literal.role, light, literal.alpha) ?? was.rgb;
    const d = resolveSlot(literal.slot, literal.role, dark, literal.alpha);
    if (!d || sameRgb(l, d)) continue;
    const kind = classify(literal);

    if (kind.verdict === 'logo') {
      const to = darkTwin(literal.file);
      logo.from = literal.file;
      logo.to = to;
      const text = textFor(d, literal.alpha, literal.raw);
      logo.changes.push({ literal, to: text, kind });
      edits.push(
        editAt(
          { ...literal, file: to },
          [literal.raw],
          text,
          nthOnLine(literal, catalogue.literals),
        ),
      );
      continue;
    }

    if (kind.verdict !== 'chrome') {
      const key = `${literal.file}|${kind.verdict}`;
      const group = kept.get(key) ?? {
        file: literal.file,
        verdict: kind.verdict,
        why: kind.why,
        count: 0,
      };
      group.count++;
      kept.set(key, group);
      continue;
    }

    const name = variableName(literal.slot, literal.role, literal.alpha);
    if (!variables.has(name)) {
      variables.set(name, {
        name,
        slot: literal.slot,
        role: literal.role,
        alpha: literal.alpha,
        light: formatCss(l, literal.alpha),
        dark: formatCss(d, literal.alpha),
      });
    }
    // A colour that is the whole of a Tailwind class has to say it is a colour.
    const reference = `${literal.colourClass ? 'color:' : ''}var(${name})`;
    const olds = [...new Set([literal.raw, textFor(l, literal.alpha, literal.raw)])];
    replaced.push({ literal, to: reference, kind });
    edits.push(editAt(literal, olds, reference, nthOnLine(literal, catalogue.literals)));
  }

  const sortedVariables = [...variables.values()].sort((a, b) => a.name.localeCompare(b.name));
  const property = (name: string, lightValue: string, darkValue: string): DarkProperty => ({
    name,
    light: lightValue,
    dark: darkValue,
  });
  const css = darkCss({
    colours: colours.map((c) => property(c.name, hex6(c.light), hex6(c.dark))),
    roles: roles.tokens
      .filter((t) => t.dark && !sameRgb(t.light, t.dark))
      .map((t) => property(`--color-${t.name}`, hex6(t.light), hex6(t.dark as Rgb))),
    variables: sortedVariables.map((v) => property(v.name, v.light, v.dark)),
  });

  const lightPlan = planLight(inputs);
  const apply: DarkPlan['apply'] = {
    copies: logo.to ? [{ from: logo.from, to: logo.to }] : copies,
    edits,
    theme: theme.length > 0 ? { file: themeFile(inputs), entries: theme } : null,
    blocks: [{ file: themeFile(inputs), marker: DARK_MARKER, text: css }],
    classes: roles.classes.map(({ rule, files, seen }) => ({ rule, files, seen })),
    created: INFRA_FILES.filter(
      (f) => f.path.endsWith('.tsx') && !f.path.endsWith('.test.tsx'),
    ).map((f) => f.path),
    scan: SCAN_DIRS,
    watch: [],
  };

  return {
    apply,
    colours,
    roles,
    variables: sortedVariables,
    replaced,
    kept: [...kept.values()].sort((a, b) => a.file.localeCompare(b.file)),
    logo: logo.to ? logo : null,
    css,
    lightEdits: lightPlan.apply.edits.length + (lightPlan.apply.theme?.entries.length ?? 0),
    warnings,
    stats: {
      colours: colours.length,
      roleTokens: roles.tokens.length,
      variables: sortedVariables.length,
      replaced: replaced.length,
      kept: [...kept.values()].reduce((n, g) => n + g.count, 0),
      classUses: roles.classes.reduce(
        (sum, m) => sum + m.files.reduce((n, f) => n + f.expected, 0),
        0,
      ),
      refs: roles.refs.length,
    },
  };
}
