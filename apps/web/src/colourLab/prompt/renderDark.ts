import { labelForSlot } from '../model/brand';
import { renderApplyScript } from './apply/script';
import { after, dayOf, header, howColoursWork, rules } from './format';
import { INFRA_FILES, LOGO_COMPONENT, LOGO_EXPORT_KEY, THEME_INIT_SCRIPT } from './infra';
import { type DarkPlan, type LiteralChange, type PromptInputs } from './inputs';
import { planDark } from './planDark';
import { opacityWords, type PromptResult } from './renderLight';
import { colourName } from './roleTokens';
import { stateOf, stateSection } from './state';
import { hex6 } from './values';

const plural = (n: number, one: string, many = `${one}s`): string => `${n} ${n === 1 ? one : many}`;

const fence = (language: string, source: string): string[] => [
  '```' + language,
  source.trimEnd(),
  '```',
  '',
];

export function summaryOfDark(plan: DarkPlan): string[] {
  const { stats } = plan;
  const out = [
    'A way to choose the theme: light, dark, or follow the device (a script before the first paint, a small module, and an **Appearance** tab in Settings).',
  ];
  if (stats.colours)
    out.push(
      `${plural(stats.colours, 'brand or palette colour')} ${stats.colours === 1 ? 'is' : 'are'} another colour in the dark theme.`,
    );
  if (stats.roleTokens) {
    out.push(
      `${plural(stats.roleTokens, 'new theme colour')} for colours that must differ by role (${plural(stats.classUses, 'class use')} and ${plural(stats.refs, 'var() reference')} move to them).`,
    );
  }
  if (stats.replaced) {
    const files = new Set(plan.replaced.map((c) => c.literal.file)).size;
    out.push(
      `${plural(stats.replaced, 'hardcoded colour')} become${stats.replaced === 1 ? 's' : ''} ${stats.replaced === 1 ? 'a variable' : 'variables'}, in ${plural(files, 'file')}.`,
    );
  }
  if (plan.logo) out.push('A dark copy of the logo.');
  out.push(
    'Content that stays light (cards, stickies, drawings, diagrams, exports) is left light.',
  );
  return out;
}

/** What the dark theme is, and what was decided about it already, for a reader who was not there. */
function whatThisIs(plan: DarkPlan): string[] {
  const lines = [
    'RoundTable has no dark theme yet. A teammate designed one in the Colour Lab, a floating widget that edits every colour the app uses, live, and judged it on every page. This document turns what they settled on into exact changes. Make them, so that the app looks as it did in the lab.',
    '',
    '**Already decided, so do not revisit it:**',
    '',
    '- The theme follows the device by default, and a person can choose Light, Dark or "Match my device" in a new **Appearance** tab of Settings. The choice is kept on that device.',
    '- Content on the board stays light in the dark theme, like paper on a dark desk: stickies, cards, drawings, diagrams, the studio sheet. What it holds was chosen against white, and a stored drawing carries its colours inside the file, where no stylesheet reaches.',
    '- Exports stay light: the recap PDF, previews and downloaded card images are files, not the page.',
    '',
  ];
  if (plan.lightEdits > 0) {
    lines.push(
      `> The lab also holds ${plural(plan.lightEdits, 'change')} to the **light** theme, which have their own prompt. If you have not applied that one, do it first: the light values below are the lab’s light values, and the dark theme is made against them.`,
      '',
    );
  }
  return lines;
}

/** How the dark theme works, so the changes below are not a list of numbers. */
function mechanism(): string[] {
  return [
    '## How the dark theme works',
    '',
    '- The theme is one attribute: `data-theme="light"` or `data-theme="dark"` on `<html>`. A script in `index.html` sets it before the first paint, so nothing flashes, and `lib/theme.ts` keeps it right afterwards.',
    "- A colour is a CSS variable, and the dark theme sets new values for those that change, under `:root[data-theme='dark']`. That block also says `color-scheme: dark`, so the browser’s own scrollbars and form controls go dark with the page.",
    '- A colour that has to be one thing as text and another as a fill (ink is the page text, and also the near-black of a scrim; the mustard is a bright accent as text and has to be deep as a button fill for light text to read on it) gets a **theme colour for each role**, such as `--color-rt-secondary-fill`. The classes and `var()` references that use it in that role move to it.',
    '- A colour written straight into the stylesheets and components as the app’s own surface or text becomes a **variable** with a light value and a dark one, such as `--rt-lit-fff7e8-fill`.',
    '- Content that stays light is found by the same selectors the lab used (listed in the CSS below). Inside it the variables take their light values back, `color-scheme` is `light`, and the text colour is set again, since text colour is inherited and would otherwise arrive pale.',
    '',
  ];
}

const swatch = (rgb: Parameters<typeof hex6>[0]): string => `\`${hex6(rgb)}\``;

function colourTables(plan: DarkPlan): string[] {
  const lines: string[] = [];
  if (plan.colours.length > 0) {
    lines.push(
      '### Brand and palette colours',
      '',
      'Set on the root in the dark theme. Their light values are the app’s own.',
      '',
      '| Colour | Light | Dark |',
      '| --- | --- | --- |',
    );
    for (const c of plan.colours) {
      lines.push(
        `| \`${c.name}\` (${labelForSlot(c.slot).label}) | ${swatch(c.light)} | ${swatch(c.dark)} |`,
      );
    }
    lines.push('');
  }
  if (plan.roles.tokens.length > 0) {
    lines.push(
      '### Colours that differ by role',
      '',
      'Each is added to the `@theme` block (so Tailwind makes classes from it) with its light value, and given its dark value in the dark theme. The uses of the colour in that role then move to it.',
      '',
    );
    for (const token of plan.roles.tokens) {
      const from = colourName(token.slot) ?? token.slot;
      const dark = token.dark ? ` → dark ${swatch(token.dark)}` : '';
      lines.push(
        `- \`--color-${token.name}\`: light ${swatch(token.light)}${dark}. It is \`${from}\` as a ${token.role}, with opacity ${opacityWords(token.alphas)}.`,
      );
      const move = plan.roles.classes.find((m) => m.token === token);
      if (move) {
        lines.push(
          `  - Classes: rename \`(${move.rule.prefixes})-${from}\` to \`…-${token.name}\`, keeping any \`/opacity\`, but only where the opacity is ${opacityWords(token.alphas)}. In: ${move.files.map((f) => `\`${f.file}\` ×${f.expected}`).join(', ')}.`,
        );
      }
      const refs = plan.roles.refs.filter((r) => r.token === token);
      if (refs.length > 0) {
        lines.push(
          `  - \`var(--color-${from})\` becomes \`var(--color-${token.name})\` at: ${refs.map((r) => `\`${r.ref.file}:${r.ref.line}\``).join(', ')}.`,
        );
      }
    }
    lines.push('');
  }
  return lines;
}

const isCode = (file: string): boolean => /\.tsx?$/.test(file);

/** The hardcoded colours that become variables, by file, with the ones in components set apart. */
function replacedList(plan: DarkPlan): string[] {
  if (plan.replaced.length === 0) return [];
  const files = new Map<string, LiteralChange[]>();
  for (const change of [...plan.replaced].sort(
    (a, b) =>
      a.literal.file.localeCompare(b.literal.file) ||
      a.literal.line - b.literal.line ||
      a.literal.col - b.literal.col,
  )) {
    files.set(change.literal.file, [...(files.get(change.literal.file) ?? []), change]);
  }
  const lines = [
    '### Hardcoded colours that become variables',
    '',
    'Each is `line:column`, the text now there, and what replaces it. In a stylesheet this is mechanical. **In a `.ts` or `.tsx` file the colour may be read by code**, to work out a contrast or to paint a canvas, and a variable cannot be read that way: after the script, look at each of those and, where the value is parsed or computed, put it back as it was and say so in your report. A colour that is only a CSS value (a `style` prop, a class, an SVG attribute) is right as a variable.',
    '',
  ];
  for (const [file, changes] of files) {
    lines.push(`#### \`${file}\`${isCode(file) ? ' (check how each is used)' : ''}`, '');
    for (const c of changes) {
      lines.push(
        `- ${c.literal.line}:${c.literal.col}  \`${c.literal.raw}\` → \`${c.to}\`  — ${c.literal.context}`,
      );
    }
    lines.push('');
  }
  return lines;
}

function keptList(plan: DarkPlan): string[] {
  const lines = ['## What stays as it is', ''];
  lines.push(
    'These hardcoded colours would be different in a dark theme, and are **left alone on purpose**, because they are paper, or are drawn into a file, or are read by code. Do not convert them. (This is only a check that nothing here was missed: if a file below is not on `main`, ignore it.)',
    '',
  );
  if (plan.kept.length === 0) lines.push('- Nothing.', '');
  else {
    for (const group of plan.kept) {
      lines.push(
        `- \`${group.file}\`: ${plural(group.count, 'colour')} — ${group.why} (${group.verdict}).`,
      );
    }
    lines.push('');
  }
  lines.push(
    'A file on `main` that is not named in this document, and holds colours, is **chrome** unless it draws content that stays light. If you meet one, convert it the way the others are and say so in your report.',
    '',
  );
  return lines;
}

function logoLines(plan: DarkPlan): string[] {
  if (!plan.logo) return [];
  return [
    '### The logo',
    '',
    `The logo is a picture shown with \`<img>\`, which cannot read the page’s variables, so it has a dark twin. The script copies \`${plan.logo.from}\` to \`${plan.logo.to}\` and changes these colours in the copy:`,
    '',
    ...plan.logo.changes.map(
      (c) => `- ${c.literal.line}:${c.literal.col}  \`${c.literal.raw}\` → \`${c.to}\``,
    ),
    '',
    `Then add \`"${LOGO_EXPORT_KEY}": "./src/assets/roundtable-logo-dark.svg"\` to the \`exports\` of \`packages/shared/package.json\`, next to the light logo’s entry, and make \`apps/web/src/components/RoundTableLogo.tsx\` choose between the two by the theme that is showing. Replace its contents with:`,
    '',
    ...fence('tsx', LOGO_COMPONENT),
  ];
}

function switching(): string[] {
  const lines = [
    '## Part 1: letting the theme be chosen',
    '',
    'None of this needs a colour; it is what makes the dark theme reachable. Do it first.',
    '',
    '### 1. Set the theme before the first paint',
    '',
    'In `apps/web/index.html`, add this inside `<head>`, before the module script, so a page for someone in dark mode is never light for a moment:',
    '',
    ...fence('html', `<script>\n${THEME_INIT_SCRIPT}\n</script>`),
    '### 2. Create these files, exactly as given',
    '',
    'They are written for this repository’s conventions and are already tested. `lib/theme.ts` keeps the theme right after the page loads, follows the device while the choice is "Match my device", and follows another tab. `AppearanceSettings.tsx` is the Appearance tab.',
    '',
  ];
  for (const file of INFRA_FILES)
    lines.push(`#### \`${file.path}\``, '', ...fence(file.language, file.source));
  lines.push(
    '### 3. Start it, and put the tab in Settings',
    '',
    '- In `apps/web/src/main.tsx`, import `followTheme` from `./lib/theme` and call `followTheme();` once, before the app is rendered.',
    '- In `apps/web/src/features/settings/SettingsPage.tsx`, add an **Appearance** tab after the last tab in the list, with id `appearance`, and render `<AppearanceSettings />` in a panel that follows the pattern of the others (`role="tabpanel"`, `id="settings-panel-appearance"`, `aria-labelledby="settings-tab-appearance"`, `hidden` when it is not the selected tab, and kept mounted). For example:',
    '',
    ...fence(
      'tsx',
      [
        "import { AppearanceSettings } from './AppearanceSettings';",
        '',
        "  { id: 'appearance', label: 'Appearance' },",
        '',
        '<div',
        '  role="tabpanel"',
        '  id="settings-panel-appearance"',
        '  aria-labelledby="settings-tab-appearance"',
        "  hidden={tab !== 'appearance'}",
        '>',
        '  <AppearanceSettings />',
        '</div>',
      ].join('\n'),
    ),
    '- Update `SettingsPage.test.tsx` only where it counts or lists the tabs.',
    '',
  );
  return lines;
}

function lookAtIt(): string[] {
  return [
    '## Look at it',
    '',
    'Run the app (`npm run dev`) and look at each of these in **both** themes, switching with Settings → Appearance and also by changing the device’s own setting while "Match my device" is chosen:',
    '',
    '- the landing page, log in, sign up, and the dashboard;',
    '- Settings (the Appearance tab, and that the choice survives a reload);',
    '- creating and editing a session, the lobby, and joining one;',
    '- a live board with every kind of card (sticky, drawing, diagram), the card menu, enlarging a card, the assistant panel, and the studio;',
    '- voting, the results, and the recap.',
    '',
    'In the dark theme the app’s own surfaces and text must be dark and readable, and **cards, stickies, drawings, diagrams, the studio sheet and the sticky composer must stay light**. Look for anything pale on pale, dark on dark, or a white patch left in a dark page, and for a flash of the wrong theme on reload. Fix what is plainly a missed colour in the way the others were fixed; report anything that is a judgement.',
    '',
  ];
}

/** The dark prompt: what to add so that the app has a dark theme, as the lab shows it. */
export function buildDarkPrompt(inputs: PromptInputs): PromptResult {
  const plan = planDark(inputs);
  const { git } = inputs.catalogue;
  const filename = `roundtable-colours-dark-${dayOf(inputs.generatedAt)}.txt`;
  const summary = summaryOfDark(plan);
  const empty =
    plan.stats.colours === 0 &&
    plan.stats.roleTokens === 0 &&
    plan.stats.variables === 0 &&
    plan.logo === null;

  const text: string[] = [...header('dark', git, inputs.generatedAt)];
  if (empty) {
    text.push(
      'The lab’s dark theme has no colour that differs from the light one. There is nothing to add.',
      '',
    );
    return {
      kind: 'dark',
      text: text.join('\n'),
      filename,
      empty,
      summary,
      warnings: plan.warnings,
    };
  }

  text.push(
    ...whatThisIs(plan),
    '## What changes',
    '',
    ...summary.map((line) => `- ${line}`),
    '',
    ...howColoursWork(),
    ...mechanism(),
    ...rules('dark', git),
    ...switching(),
    '## Part 2: the colours',
    '',
    'Most of this is mechanical, so it is done by one script, given at the end of this document. Save it as `colour-lab-apply.mjs` in the repository root, then:',
    '',
    '```',
    'node colour-lab-apply.mjs --check   # reads and reports, writes nothing',
    'node colour-lab-apply.mjs           # makes the changes',
    '```',
    '',
    'It writes the dark theme into the stylesheet between two marker comments (so running it twice leaves one copy), adds the role colours to `@theme`, moves the classes and `var()` references that use them, and replaces the hardcoded colours listed below. Its report has one line for each thing it did: `APPLIED`, `ALREADY`, `SKIPPED` with the reason, `THEME`, `CONFLICT` where the repository already has a different value, `BLOCK`, `COPY`, `CLASSES` with a count to compare, and `STRAY` for a use of a class in a file the lab never saw, which you handle the same way. Delete the script when you are done.',
    '',
    '### The CSS the script writes',
    '',
    `It goes at the end of \`${plan.apply.blocks[0]?.file ?? 'apps/web/src/index.css'}\`, after Tailwind’s own rules, which is what lets it win over the theme colours.`,
    '',
    ...fence('css', plan.css),
    ...colourTables(plan),
    ...replacedList(plan),
    ...logoLines(plan),
    ...keptList(plan),
    ...lookAtIt(),
    ...after([], 'dark'),
  );

  if (plan.warnings.length > 0) {
    text.push('## Things the lab could not read', '', ...plan.warnings.map((w) => `- ${w}`), '');
  }
  text.push('## The script file', '', '```js', renderApplyScript(plan.apply).trimEnd(), '```', '');
  text.push(...stateSection(stateOf(inputs.edits, git, inputs.generatedAt)));

  return { kind: 'dark', text: text.join('\n'), filename, empty, summary, warnings: plan.warnings };
}
