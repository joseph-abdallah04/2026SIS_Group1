import { agendaMinutes } from '../LobbyAgenda';
import type { SetupFormState } from './useSessionSetupForm';

/**
 * About how long the agenda runs at the set timers, counted the way the lobby
 * counts it (`agendaMinutes`), so the two pages never disagree. Only written
 * questions count; `null` with no discussion timer or nothing written.
 */
export function estimateMinutes(state: SetupFormState): number | null {
  return agendaMinutes(
    state.questions.filter((q) => q.text.trim().length > 0),
    state.discussionTimerSeconds,
    state.votingTimerSeconds,
  );
}

/** The footer's facts about the session, in order: questions, length, call. */
export function summaryParts(state: SetupFormState): string[] {
  const count = state.questions.filter((q) => q.text.trim().length > 0).length;
  const minutes = estimateMinutes(state);
  return [
    `${count} ${count === 1 ? 'question' : 'questions'}`,
    minutes === null ? 'No timers' : `About ${minutes} min`,
    state.voiceEnabled ? 'Live call' : 'No call',
  ];
}

/** "5 min", "2 min 30 s", "1 h": a timer's length as the chips say it. */
export function formatTimer(seconds: number | null): string {
  if (!seconds) return 'Off';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return [h ? `${h} h` : '', m ? `${m} min` : '', s ? `${s} s` : ''].filter(Boolean).join(' ');
}
