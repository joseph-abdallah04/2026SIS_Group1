import type { SessionQuestionInput } from '@roundtable/shared/schemas';

/**
 * Where a template came from. Only the ones shipped with the app for now;
 * a team's or a leader's own would be further sources, served by the API.
 */
export type SessionTemplateSource = 'built-in';

/** The picture on a template's card, named rather than imported so the data stays plain. */
export type SessionTemplateIcon = 'blank' | 'sprint' | 'retro' | 'ideas';

/** The card's colour, one of the app's tones. */
export type SessionTemplateTone = 'neutral' | 'cool' | 'plum' | 'amber';

/**
 * A starting point for a new session: everything the setup form holds,
 * filled in. Plain data, so the same shape can come from the server later.
 */
export interface SessionTemplate {
  /** Stable, URL-safe and unique: `/sessions/new?template=<id>`. */
  id: string;
  /** Bumped when a template's content changes, for anything that remembers one. */
  version: number;
  source: SessionTemplateSource;
  name: string;
  /** One line under the name on its card. */
  summary: string;
  icon: SessionTemplateIcon;
  tone: SessionTemplateTone;
  /** Filled in and selected, so typing replaces it. Empty leaves the box empty. */
  title: string;
  /** Shown in the title box once it is empty. */
  titlePlaceholder: string;
  /** In order. None means the form's one blank question. */
  questions: SessionQuestionInput[];
  discussionTimerSeconds: number | null;
  votingTimerSeconds: number | null;
  voiceEnabled: boolean;
}
