import { type LiteralOccurrence } from '../catalogue/types';

/**
 * What a hardcoded colour is for, which decides what a dark theme does with it.
 *
 *   chrome   the app's own surfaces and text: it goes dark with them
 *   paper    the colours of content that stays light, like paper on a dark desk: stickies, cards,
 *            drawings, diagrams, the studio sheet
 *   export   drawn into a file (a recap PDF, a preview, a downloaded image) and never into the
 *            live page, so a theme cannot reach it: it stays as it is
 *   logic    a colour that code reads rather than draws, such as a fill for a canvas
 *   logo     the logo, which is a picture and needs a second picture
 */
export type Verdict = 'chrome' | 'paper' | 'export' | 'logic' | 'logo';

export interface Classified {
  verdict: Verdict;
  /** In a few words, why. */
  why: string;
}

interface FileRule {
  test: RegExp;
  verdict: Verdict;
  why: string;
}

/**
 * The files whose colours are not the app's chrome. Found by looking at what each is used for,
 * not by a name, so a new file on main that is not here is treated as chrome, and the prompt
 * tells whoever applies it to check.
 */
const FILES: readonly FileRule[] = [
  {
    test: /features\/pinboard\/(pinboardTokens|ProposalCard|MyProposalsPanel)\.tsx?$/,
    verdict: 'paper',
    why: 'the paper of a card or a sticky',
  },
  {
    test: /features\/tools\/sticky\//,
    verdict: 'paper',
    why: 'the sticky being written is paper',
  },
  {
    test: /(features\/tools\/diagram\/|packages\/shared\/src\/diagramContract\.ts$|features\/assistant\/DiagramPreview\.tsx$)/,
    verdict: 'paper',
    why: 'diagram colours are chosen against a white sheet',
  },
  {
    test: /features\/tools\/drawing\//,
    verdict: 'paper',
    why: 'a drawing is made on a white canvas',
  },
  {
    test: /features\/tools\/studio\/(StudioArtwork|StudioArrowView|studioTheme)\./,
    verdict: 'paper',
    why: 'the studio sheet and what is drawn on it',
  },
  {
    test: /features\/tools\/image\/ImageCropper\.tsx$/,
    verdict: 'paper',
    why: 'drawn over a photo, whatever the theme',
  },
  {
    test: /features\/pinboard\/proposalExport\.ts$/,
    verdict: 'export',
    why: 'the background of a downloaded card image',
  },
  {
    test: /features\/tools\/image\/imageEncoding\.ts$/,
    verdict: 'logic',
    why: 'a canvas fill for an encoded image: code reads it',
  },
  {
    test: /packages\/shared\/src\/assets\/roundtable-logo\.svg$/,
    verdict: 'logo',
    why: 'the logo is a picture',
  },
];

/** Selectors in the assistant's stylesheet that style content which stays light. */
const PAPER_SELECTORS = /\.rt-assistant-(sticky|card-well|diagram-fit)\b/;

export function classify(literal: LiteralOccurrence): Classified {
  if (literal.exportOnly) {
    return { verdict: 'export', why: 'drawn into exports (PDF, previews), not the page' };
  }
  const byFile = FILES.find((rule) => rule.test.test(literal.file));
  if (byFile) return { verdict: byFile.verdict, why: byFile.why };
  if (literal.file.endsWith('assistant.css') && PAPER_SELECTORS.test(literal.context)) {
    return { verdict: 'paper', why: 'a sticky or card the assistant has made, which stays light' };
  }
  return { verdict: 'chrome', why: 'the app’s own surface or text' };
}
