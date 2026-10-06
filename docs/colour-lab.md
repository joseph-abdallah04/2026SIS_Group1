# Colour Lab

A developer tool for trying other colours for RoundTable, and for handing the result to
someone who can put it into the app. It lives on the **`colour-testing`** branch, which is never
merged and never has a pull request. `main` knows nothing about it.

It is a floating panel on every page of the running app. You change a colour and the page changes
with you, in the light theme or in a dark theme the app does not have yet. When you are happy, it
writes a **prompt**: one text file that tells Claude, on `main`, exactly what to change.

## Running it

```
git switch colour-testing
npm install
npm run dev --workspace @roundtable/web
```

Open the app in a browser. A **Colour Lab** pill appears at the top right: click it to open the
panel, drag it by its header to move it, and press the minus to fold it away again. It only exists
in development and cannot reach a production build.

For the pages that need data (the board, voting, the recap) you also need the server and the
database, as for any work on the app (`npm run db:up`, then `npm run dev`).

Two switches, for when the lab is in the way: add `?colourLab=off` to a URL to turn it off for that
page, and `?colourLabShield=off` to stop it shielding itself from the page’s own key and mouse
handling (useful only when debugging the lab).

## Trying colours

- **This page / Changed / All** choose which colours are listed. _This page_ shows what the page you
  are on uses, and updates as you move around the app.
- Search by name, hex value or file.
- A **swatch** opens the picker. The page changes as you drag. The picker has a hue and saturation
  square, hex and RGB fields, an eyedropper, the brand colours as quick choices, and a comparison
  of the original with what you have now.
- **Hover a row** and the places on the page that use that colour are outlined.
- **Brand colours** (the `--color-rt-*` tokens), **Tailwind colours** (`white`, `black`, `red-*`)
  and **hardcoded colours** (a hex or `rgba()` written straight into CSS, TypeScript or an SVG, 80
  of them today) are all listed, along with the logo’s.
- **Copies follow their colour.** A hardcoded colour with the same value as a brand token starts out
  linked to it, so changing Ink changes the `rgba(8, 12, 21, 0.12)` shadows too. A chip on the row
  says so, and _unlink_ makes it your own. Anything that has a link can be set back to its default
  with the reset arrow on its row; the arrow in the header resets everything in the current theme.
- **Roles.** The same colour is text in one place and a background in another, and in a dark theme
  those want different values (the mustard is a bright accent as text and has to be deep as a button
  fill). The picker has tabs, **All / Text / Fill / Border / Shadow / Image**: set a colour for a
  role and only that role changes.
- **Light / Dark** in the header switches which theme you are editing and looking at. The dark theme
  starts from a palette that was tuned by hand and checked for contrast, and is yours to change.
  Content that stays light in the dark theme, like paper on a dark desk (stickies, cards, drawings,
  diagrams, the studio sheet), is shown light.
- **Pick** lets you click anything on the page: the panel then shows which colours paint its text,
  fill, border and shadow, how well its text reads on what is behind it (a WCAG contrast score),
  and lets you edit any of them from there. It looks through elements that paint nothing, such as
  overlays, to what you can see.

Everything you change is kept in your browser (`localStorage`), per theme, and survives a reload.
It is not shared with anyone until you make a prompt.

## Making a prompt

At the bottom of the panel are **Create light prompt** and **Create dark prompt**. Each opens a
sheet that says what the prompt holds, and has **Download .txt** and **Copy**.

- The **light prompt** is only what you changed in the light theme, relative to the app as it is on
  `main`: the brand colours, Tailwind colours, every hardcoded copy that follows them (each with its
  file, line and column, written in the same syntax as the original), and, where you set a colour
  apart by role, a new theme colour for that role and the places that move to it.
- The **dark prompt** adds a dark theme to the app. It carries the code that lets a person choose
  Light, Dark or "Match my device" (an **Appearance** tab in Settings, remembered on the device),
  the dark values of every colour, the CSS that keeps cards and drawings light inside a dark page,
  and a dark copy of the logo. It is made whether or not you changed anything in the dark theme,
  because the palette is the lab’s own.

If you also changed the light theme, apply the **light prompt first**, then the dark one: the dark
prompt’s light values are the lab’s light values.

Both prompts contain a Node script that makes the mechanical changes, so Claude does not have to
retype a hundred colours. The script is written to be safe to run on a `main` that has moved on:
it finds each colour where it was, and failing that by the line it was on, skips and reports
what is not there, and changes nothing the second time it runs.

**Loading** goes the other way. In the sheet, _Load colours from a prompt…_ reads the state that
every prompt ends with and puts the lab back to those colours, so a teammate can pick up where you
left off.

### Applying a prompt

1. On a clean checkout of `main` (a new branch off it, not `colour-testing`), start Claude Code,
   preferably with the strongest model.
2. Give it the `.txt` file, or paste it. It needs nothing else.
3. It will save the script, run it with `--check` to read what it would do, run it for real, and
   work through the rest: new theme colours, class and `var()` moves, a few tests that name a colour
   or class that changed, formatting. It ends with a report.
4. Read the report and `git diff` yourself. The report says what was skipped (usually colours that
   are on `colour-testing` but not on `main` yet) and why.
5. Look at the app in a browser. The dark prompt lists the screens to check.

The prompt tells Claude not to commit. That is for you to do, on your branch, once you are happy.

## Keeping it up to date

`colour-testing` stays level with the app by merging `main` into it: `git merge main`. The lab’s own
code is all under `apps/web/src/colourLab/`, and the app has just two lines of it (an import in
`apps/web/src/main.tsx` and a plugin in `apps/web/vite.config.ts`), so a merge should be clean.

The catalogue of colours is read from the source while the dev server runs, and refreshes by itself
when a file changes. After a merge nothing needs rebuilding. A new brand token appears in the list
labelled from its own name; give it a friendly one in `colourLab/model/brand.ts`.

## What it cannot do

- It sees the colours that are in the source and on the page. A colour computed in code, such as a
  contrast-picked text colour, follows its inputs but is not itself listed.
- Pictures it cannot read, such as photos, are left alone. SVG pictures (the logo, stored drawings)
  are rewritten on the fly.
- A colour that is only a Tailwind palette default (`red-600`) cannot be linked to a brand token, since
  the app does not define it. The prompt defines it in the theme.
- The dark prompt makes an app that is dark; it does not make decisions the lab did not: where
  the app’s own code reads a colour (to measure a contrast, to paint a canvas), the prompt says to
  keep it and report.

## For whoever works on the lab

```
apps/web/src/colourLab/
  colour/      parsing, converting and measuring colours; reading values out of CSS
  catalogue/   reads the source for every colour: tokens, hardcoded colours, classes, var() uses
  model/       the colours as slots, how they link, resolve and differ by role and theme; the dark palette
  engine/      repaints the page: one stylesheet of variables, and the rules and elements that read them
  detect/      which colours a page uses; what paints an element (Pick)
  host/        the shadow-DOM host, the top layer, and the shield that keeps the page’s handlers off it
  ui/          the panel, picker, rows, inspector, prompt sheet
  prompt/      the two prompts: what to change, the apply script, the dark theme’s code
  node/        the Vite plugin that serves the catalogue
```

- Tests: `npx vitest run src/colourLab` in `apps/web`. The prompts have golden files in
  `prompt/__golden__/`; if you change what a prompt says, run
  `npx vitest run src/colourLab/prompt -u` and read the diff to those files, since a prompt is an
  instruction to someone who cannot ask what was meant.
- The apply script is plain JavaScript in `prompt/apply/` (`core.js`, `runner.js`), tested directly and by
  running the assembled script on a fixture repository.
- The theme code in `prompt/infra/` is real, tested app code laid out as it will be in the app; the
  dark prompt carries it word for word.
- Lab code must not contain strings that look like Tailwind classes where it can be avoided, since
  Tailwind scans the whole tree.
