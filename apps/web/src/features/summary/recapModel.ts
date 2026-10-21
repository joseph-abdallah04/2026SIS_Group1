import {
  RECAP_OUTCOME_LABEL,
  recapQuestionOutcome,
  type BoardItem,
  type RecapOutcomeKind,
  type SessionRecap,
  type SessionRecapParticipant,
  type SessionRecapQuestion,
  type VotingTally,
} from '@roundtable/shared';

import { PROPOSAL_KIND_LABEL } from '../pinboard/proposalExport';
import { stickyPlainText } from '../tools/sticky/stickyMarks';

/*
 * What the summary page says, worked out from the recap alone. No React here:
 * the components only lay it out, so every rule is tested in one place.
 */

/** Each card's tally, looked up once rather than searched for per card. */
export function tallyMap(question: SessionRecapQuestion): Map<string, VotingTally> {
  return new Map(question.tallies.map((row) => [row.proposalId, row]));
}

/**
 * A vote's shortlist in the order to read it: the winner or every tied card
 * first, then the rest by votes. Ties in the rest keep the server's order, so
 * the list never shuffles between two looks at it. A brainstorm keeps its
 * own order: oldest idea first.
 */
export function rankedProposals(question: SessionRecapQuestion): BoardItem[] {
  if (!question.votingEnabled) return question.proposals;
  const tallies = tallyMap(question);
  const lead = new Set(
    question.winnerProposalId ? [question.winnerProposalId] : question.tiedProposalIds,
  );
  return question.proposals
    .map((item, index) => ({ item, index }))
    .sort(
      (a, b) =>
        Number(lead.has(b.item.id)) - Number(lead.has(a.item.id)) ||
        (tallies.get(b.item.id)?.votes ?? 0) - (tallies.get(a.item.id)?.votes ?? 0) ||
        a.index - b.index,
    )
    .map(({ item }) => item);
}

/**
 * What a card says, in a line: a note's words, or what kind of card it is and
 * whose. `withAuthor: false` where the author is shown beside it anyway.
 */
export function cardLabel(item: BoardItem, viewerId: string | null, withAuthor = true): string {
  if (item.artifactJson.type === 'sticky') {
    const text = stickyPlainText(item.artifactJson).replace(/\s+/g, ' ').trim();
    if (text) return text;
  }
  const kind = PROPOSAL_KIND_LABEL[item.type];
  const article = /^[aeiou]/.test(kind) ? 'An' : 'A';
  const what = `${article} ${kind}`;
  return withAuthor ? `${what} by ${authorName(item, viewerId)}` : what;
}

export function authorName(item: BoardItem, viewerId: string | null): string {
  return viewerId !== null && item.authorId === viewerId ? 'you' : item.authorName;
}

/** A card of this question's board, shortlisted or not. */
export function findCard(question: SessionRecapQuestion, id: string | null): BoardItem | null {
  if (!id) return null;
  return (
    question.proposals.find((item) => item.id === id) ??
    question.otherProposals?.find((item) => item.id === id) ??
    null
  );
}

/** "Builds on Maya's idea" for a card that extended someone's (F23); none otherwise. */
export function buildsOnText(item: BoardItem, viewerId: string | null): string | null {
  const original = item.extendsFrom;
  if (!original) return null;
  if (viewerId !== null && original.authorId === viewerId) return 'Builds on your idea';
  return `Builds on ${original.authorName}’s idea`;
}

/** The winning card, if the vote has one and it is still on the shortlist. */
export function winningCard(question: SessionRecapQuestion): BoardItem | null {
  const id = question.winnerProposalId;
  return id ? (question.proposals.find((item) => item.id === id) ?? null) : null;
}

export function tiedCards(question: SessionRecapQuestion): BoardItem[] {
  const tied = new Set(question.tiedProposalIds);
  return question.proposals.filter((item) => tied.has(item.id));
}

function plural(count: number, one: string, many = `${one}s`): string {
  return `${count} ${count === 1 ? one : many}`;
}

/**
 * The question's answer in one line, for "At a glance": what won, what tied,
 * how many ideas, or why there is no answer.
 */
export function answerLine(question: SessionRecapQuestion, viewerId: string | null): string {
  const outcome = recapQuestionOutcome(question);
  switch (outcome.kind) {
    case 'decided': {
      const card = winningCard(question);
      return card ? cardLabel(card, viewerId) : 'Decided';
    }
    case 'tied':
      return tiedCards(question)
        .map((card) => cardLabel(card, viewerId))
        .join(' · ');
    case 'discussed':
    case 'not-voted': {
      const count = question.proposals.length;
      if (count === 0) return 'No ideas were added';
      return outcome.kind === 'discussed'
        ? plural(count, 'idea')
        : `${plural(count, 'idea')}, not voted on`;
    }
    case 'no-votes':
      return `${question.proposals.length} shortlisted, nobody voted`;
    case 'vote-open':
      return question.votedCount > 0
        ? `${plural(question.votedCount, 'vote')} in when it ended, not final`
        : 'Ended before anyone voted';
    case 'skipped':
      return question.skipReason?.trim() || 'Passed over';
    case 'not-reached':
      return 'The session ended first';
  }
}

/** The quiet line under a question: who voted and what was in it, or how many ideas. */
export function metaLine(question: SessionRecapQuestion): string | null {
  const outcome = recapQuestionOutcome(question).kind;
  const count = question.proposals.length;
  if (outcome === 'discussed' || outcome === 'not-voted') {
    return count > 0 ? plural(count, 'idea') : null;
  }
  const parts = [
    question.votedCount > 0 ? `${question.votedCount} voted` : null,
    count > 0 ? `${count} shortlisted` : null,
  ].filter((part): part is string => part !== null);
  return parts.length > 0 ? parts.join(' · ') : null;
}

/** The order outcomes are counted in: what was settled first, then what was left. */
const OUTCOME_ORDER: RecapOutcomeKind[] = [
  'decided',
  'tied',
  'discussed',
  'no-votes',
  'vote-open',
  'not-voted',
  'skipped',
  'not-reached',
];

export interface OutcomeTally {
  kind: RecapOutcomeKind;
  count: number;
  /** "decided", "not reached": the question's own badge, to follow a number. */
  label: string;
}

/**
 * How many questions ended each way, in the words of their badges, leaving
 * out what did not happen.
 */
export function outcomeTally(questions: SessionRecapQuestion[]): OutcomeTally[] {
  const counts = new Map<RecapOutcomeKind, number>();
  for (const question of questions) {
    const kind = recapQuestionOutcome(question).kind;
    counts.set(kind, (counts.get(kind) ?? 0) + 1);
  }
  return OUTCOME_ORDER.flatMap((kind) => {
    const count = counts.get(kind) ?? 0;
    return count > 0 ? [{ kind, count, label: RECAP_OUTCOME_LABEL[kind].toLowerCase() }] : [];
  });
}

/** How many ended one way: 0 when none did. */
export function tallyOf(tally: OutcomeTally[], kind: RecapOutcomeKind): number {
  return tally.find((row) => row.kind === kind)?.count ?? 0;
}

/** "2 decided · 1 tied · 1 not reached". */
export function tallyLine(tally: OutcomeTally[]): string {
  return tally.map(({ count, label }) => `${count} ${label}`).join(' · ');
}

/** Everyone who took part: the leader first, then you, then the rest in the order they joined. */
export function orderedPeople(
  participants: SessionRecapParticipant[],
  viewerId: string | null,
): { person: SessionRecapParticipant; key: string; isViewer: boolean }[] {
  const rank = (person: SessionRecapParticipant) =>
    person.isLeader ? 0 : viewerId !== null && person.userId === viewerId ? 1 : 2;
  return participants
    .map((person, index) => ({
      person,
      // A deleted account has no id, and there can be more than one.
      key: person.userId ?? `gone-${index}`,
      isViewer: viewerId !== null && person.userId === viewerId,
      index,
    }))
    .sort((a, b) => rank(a.person) - rank(b.person) || a.index - b.index)
    .map(({ person, key, isViewer }) => ({ person, key, isViewer }));
}

/** "Maya, you and 3 others": the first two named, the rest counted. */
export function peopleLine(
  people: { person: SessionRecapParticipant; isViewer: boolean }[],
): string {
  const named = people
    .slice(0, 2)
    .map(({ person, isViewer }) =>
      isViewer ? 'you' : (person.displayName.trim().split(/\s+/)[0] ?? person.displayName),
    );
  const others = people.length - named.length;
  if (named.length === 0) return 'Nobody';
  if (others <= 0) return named.join(' and ');
  return `${named.join(', ')} and ${plural(others, 'other')}`;
}

function clock(date: Date): string {
  return date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

/** "45 min", "2 h 35 min". */
export function durationText(minutes: number): string {
  if (minutes < 60) return `${Math.max(1, minutes)} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours} h ${rest} min` : `${hours} h`;
}

export interface MeetingFacts {
  /** "Tue, Oct 14", first on the facts line. */
  day: string;
  /** "10:02 to 10:47 · 45 min · Live call · Led by Maya Chen" as separate facts. */
  facts: string[];
}

/**
 * When it was, how long, whether there was a call, and who led it, in the
 * viewer's own zone and clock. A session ended from the lobby never started,
 * so it has an end and no length.
 */
export function meetingFacts(
  summary: SessionRecap,
  { viewerId, voiceEnabled }: { viewerId: string | null; voiceEnabled?: boolean },
): MeetingFacts {
  const started = summary.startedAt ? new Date(summary.startedAt) : null;
  const ended = summary.endedAt ? new Date(summary.endedAt) : null;
  const anchor = started ?? ended ?? new Date(summary.createdAt);
  const day = anchor.toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
  const facts: string[] = [];
  if (started && ended) {
    facts.push(`${clock(started)} to ${clock(ended)}`);
    facts.push(durationText(Math.round((ended.getTime() - started.getTime()) / 60000)));
  } else if (ended) {
    facts.push(`Ended ${clock(ended)}`);
  }
  if (voiceEnabled !== undefined) facts.push(voiceEnabled ? 'Live call' : 'No call');
  const leader = summary.participants.find((person) => person.isLeader);
  if (leader) {
    facts.push(
      viewerId !== null && leader.userId === viewerId
        ? 'Led by you'
        : `Led by ${leader.displayName}`,
    );
  }
  return { day, facts };
}

/** How many ideas a wall shows at full size, and how many it shows at all before "Show all". */
export const IDEA_WALL = {
  /** Up to this many, every idea at its board size. */
  fullSizeMax: 6,
  /** Past that, smaller cards, this many before "Show all". */
  compactFirst: 12,
  compactScale: 0.72,
} as const;

/**
 * The ideas wall's mode (Tristan's B1 + B2): a handful at full size, a crowd
 * smaller so more of it is seen at once, and past a dozen the rest behind
 * "Show all".
 */
export function ideaWallLayout(count: number): { compact: boolean; firstShown: number } {
  if (count <= IDEA_WALL.fullSizeMax) return { compact: false, firstShown: count };
  return { compact: true, firstShown: Math.min(count, IDEA_WALL.compactFirst) };
}
