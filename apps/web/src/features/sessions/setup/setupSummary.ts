import { agendaMinutes } from '../LobbyAgenda';

/**
 * What the summary needs of a session: the setup form's state and a saved
 * draft both have this shape, so both say the same thing about it.
 */
export interface SessionFactsSource {
  questions: readonly { text: string; votingEnabled: boolean }[];
  discussionTimerSeconds: number | null;
  votingTimerSeconds: number | null;
  voiceEnabled: boolean;
}

function written(source: SessionFactsSource) {
  return source.questions.filter((q) => q.text.trim().length > 0);
}

/**
 * About how long the agenda runs at the set timers, counted the way the lobby
 * counts it (`agendaMinutes`), so the pages never disagree. Only written
 * questions count; `null` with no discussion timer or nothing written.
 */
export function estimateMinutes(source: SessionFactsSource): number | null {
  return agendaMinutes(written(source), source.discussionTimerSeconds, source.votingTimerSeconds);
}

/** A session's facts, in order: questions, length, call. */
export function sessionFacts(source: SessionFactsSource): string[] {
  const count = written(source).length;
  const minutes = estimateMinutes(source);
  return [
    `${count} ${count === 1 ? 'question' : 'questions'}`,
    minutes === null ? 'No timers' : `About ${minutes} min`,
    source.voiceEnabled ? 'Live call' : 'No call',
  ];
}

/**
 * A timer's length: `long` as a line of text says it ("2 min 30 s"), `short`
 * as a chip says it ("2m 30s"). Off when there is none.
 */
export function formatTimer(seconds: number | null, style: 'long' | 'short' = 'long'): string {
  if (!seconds) return 'Off';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const units = style === 'long' ? [' h', ' min', ' s'] : ['h', 'm', 's'];
  return [h ? `${h}${units[0]}` : '', m ? `${m}${units[1]}` : '', s ? `${s}${units[2]}` : '']
    .filter(Boolean)
    .join(' ');
}
