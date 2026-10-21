import {
  recapEmptyMessage,
  recapQuestionOutcome,
  recapQuestionStatusLabel,
  type BoardItem,
  type SessionRecap,
  type SessionRecapQuestion,
} from '@roundtable/shared';
import { describe, expect, it } from 'vitest';

import {
  answerLine,
  buildsOnText,
  cardLabel,
  durationText,
  findCard,
  ideaWallLayout,
  meetingFacts,
  metaLine,
  orderedPeople,
  outcomeTally,
  peopleLine,
  rankedProposals,
  tallyLine,
  tallyOf,
} from './recapModel';

function sticky(id: string, text: string, authorId = 'u2', authorName = 'Ada'): BoardItem {
  return {
    id,
    questionId: 'q1',
    authorId,
    authorName,
    type: 'sticky',
    artifactJson: { type: 'sticky', text, color: 'yellow' },
    x: 0,
    y: 0,
    z: 0,
    createdAt: '2026-09-01T01:10:00.000Z',
    editedAt: null,
    extendsProposalId: null,
    extendsFrom: null,
    reactions: [],
  };
}

const VOTE: SessionRecapQuestion = {
  id: 'q1',
  position: 0,
  text: 'What ships first?',
  status: 'answered',
  votingEnabled: true,
  proposals: [sticky('a', 'Alpha'), sticky('b', 'Bravo'), sticky('c', 'Charlie')],
  winnerProposalId: 'c',
  tiedProposalIds: [],
  tallies: [
    { proposalId: 'a', votes: 1, percent: 17 },
    { proposalId: 'b', votes: 2, percent: 33 },
    { proposalId: 'c', votes: 3, percent: 50 },
  ],
  votedCount: 6,
};

const q = (over: Partial<SessionRecapQuestion>): SessionRecapQuestion => ({ ...VOTE, ...over });

describe('recapQuestionOutcome (shared)', () => {
  const cases: [string, Partial<SessionRecapQuestion>, string, string][] = [
    ['a closed vote with a winner', {}, 'decided', 'Decided'],
    [
      'a closed vote with a tie',
      { winnerProposalId: null, tiedProposalIds: ['b', 'c'] },
      'tied',
      'Tied',
    ],
    [
      'a closed ballot nobody voted in',
      { winnerProposalId: null, votedCount: 0 },
      'no-votes',
      'No votes cast',
    ],
    [
      'a ballot the session ended on',
      { status: 'voting', winnerProposalId: null },
      'vote-open',
      'Vote not closed',
    ],
    [
      'a shortlist the session ended before',
      { status: 'voting', winnerProposalId: null, proposals: [], votedCount: 0 },
      'not-voted',
      'Not voted on',
    ],
    [
      'a vote ended mid-discussion',
      { status: 'discussion', winnerProposalId: null },
      'not-voted',
      'Not voted on',
    ],
    [
      'a vote skipped before it closed',
      { status: 'skipped', winnerProposalId: null },
      'skipped',
      'Skipped',
    ],
    [
      'a vote never reached',
      { status: 'pending', winnerProposalId: null },
      'not-reached',
      'Not reached',
    ],
    ['a brainstorm', { votingEnabled: false, winnerProposalId: null }, 'discussed', 'Discussed'],
    [
      'a brainstorm ended mid-discussion',
      { votingEnabled: false, status: 'discussion', winnerProposalId: null },
      'discussed',
      'Discussed',
    ],
    ['a skipped brainstorm', { votingEnabled: false, status: 'skipped' }, 'skipped', 'Skipped'],
  ];
  it.each(cases)('reads %s', (_, over, kind, label) => {
    expect(recapQuestionOutcome(q(over)).kind).toBe(kind);
    expect(recapQuestionStatusLabel(q(over))).toBe(label);
  });

  it('keeps the result of a vote skipped after it closed, and says so', () => {
    const question = q({ status: 'skipped', skipReason: 'Settled' });
    expect(recapQuestionOutcome(question)).toEqual({
      kind: 'decided',
      winnerProposalId: 'c',
      skippedAfter: true,
    });
    expect(recapQuestionStatusLabel(question)).toBe('Decided, then skipped: Settled');
  });

  it('says what an empty question is, by why it is empty', () => {
    expect(recapEmptyMessage(q({ votingEnabled: false, proposals: [] }))).toBe(
      'No ideas were added.',
    );
    expect(recapEmptyMessage(q({ status: 'skipped', winnerProposalId: null }))).toBe(
      'Skipped before anything was shortlisted.',
    );
    expect(recapEmptyMessage(q({ status: 'pending', winnerProposalId: null }))).toBe(
      'The session ended before this question.',
    );
  });
});

describe('rankedProposals', () => {
  it('puts the winner first, then the rest by votes', () => {
    expect(rankedProposals(VOTE).map((item) => item.id)).toEqual(['c', 'b', 'a']);
  });

  it('puts every tied card first, and keeps equal votes in the order they came', () => {
    const tied = q({
      winnerProposalId: null,
      tiedProposalIds: ['a', 'c'],
      tallies: [
        { proposalId: 'a', votes: 2, percent: 40 },
        { proposalId: 'b', votes: 1, percent: 20 },
        { proposalId: 'c', votes: 2, percent: 40 },
      ],
    });
    expect(rankedProposals(tied).map((item) => item.id)).toEqual(['a', 'c', 'b']);
  });

  it('leaves a brainstorm in its own order', () => {
    expect(rankedProposals(q({ votingEnabled: false })).map((item) => item.id)).toEqual([
      'a',
      'b',
      'c',
    ]);
  });
});

describe('the lines the page says', () => {
  it('names a card by its words, or by its kind and author', () => {
    const drawing: BoardItem = {
      ...sticky('d', ''),
      type: 'drawing',
      artifactJson: { type: 'drawing', svg: '<svg/>' },
    };
    expect(cardLabel(sticky('x', '  Ship   it '), null)).toBe('Ship it');
    expect(cardLabel(drawing, null)).toBe('A drawing by Ada');
    expect(cardLabel(drawing, 'u2')).toBe('A drawing by you');
    expect(cardLabel(drawing, null, false)).toBe('A drawing');
    expect(cardLabel({ ...drawing, type: 'image' }, null)).toBe('An image by Ada');
  });

  it('answers each question in a line', () => {
    expect(answerLine(VOTE, null)).toBe('Charlie');
    expect(answerLine(q({ winnerProposalId: null, tiedProposalIds: ['a', 'b'] }), null)).toBe(
      'Alpha · Bravo',
    );
    expect(answerLine(q({ votingEnabled: false, winnerProposalId: null }), null)).toBe('3 ideas');
    expect(answerLine(q({ winnerProposalId: null, votedCount: 0 }), null)).toBe(
      '3 shortlisted, nobody voted',
    );
    expect(answerLine(q({ status: 'voting', winnerProposalId: null }), null)).toBe(
      '6 votes in when it ended, not final',
    );
    expect(
      answerLine(q({ status: 'skipped', winnerProposalId: null, skipReason: ' Later ' }), null),
    ).toBe('Later');
    expect(answerLine(q({ status: 'pending', winnerProposalId: null }), null)).toBe(
      'The session ended first',
    );
  });

  it('counts votes and cards, or ideas, under a question', () => {
    expect(metaLine(VOTE)).toBe('6 voted · 3 shortlisted');
    expect(metaLine(q({ votingEnabled: false }))).toBe('3 ideas');
    expect(
      metaLine(q({ status: 'pending', winnerProposalId: null, proposals: [], votedCount: 0 })),
    ).toBeNull();
  });

  it('sums up the meeting in the badges’ words, leaving out what did not happen', () => {
    const tally = outcomeTally([
      q({ status: 'pending', winnerProposalId: null }),
      VOTE,
      q({ winnerProposalId: null, tiedProposalIds: ['a', 'b'] }),
      q({ votingEnabled: false }),
      VOTE,
    ]);
    expect(tally.map(({ kind, count }) => [kind, count])).toEqual([
      ['decided', 2],
      ['tied', 1],
      ['discussed', 1],
      ['not-reached', 1],
    ]);
    expect(tallyLine(tally)).toBe('2 decided · 1 tied · 1 discussed · 1 not reached');
    expect(tallyOf(tally, 'decided')).toBe(2);
    expect(tallyOf(tally, 'skipped')).toBe(0);
  });
});

describe('people', () => {
  const people = [
    { userId: 'u5', displayName: 'Sam Rivera', isLeader: false },
    { userId: 'u2', displayName: 'Ada Lovelace', isLeader: false },
    { userId: null, displayName: 'Deleted user', isLeader: false },
    { userId: 'u1', displayName: 'Maya Chen', isLeader: true },
  ];

  it('puts the leader first, then you, then the rest as they joined', () => {
    const ordered = orderedPeople(people, 'u2');
    expect(ordered.map(({ person }) => person.displayName)).toEqual([
      'Maya Chen',
      'Ada Lovelace',
      'Sam Rivera',
      'Deleted user',
    ]);
    expect(ordered.map(({ key }) => key)).toEqual(['u1', 'u2', 'u5', 'gone-2']);
    expect(peopleLine(ordered)).toBe('Maya, you and 2 others');
  });

  it('names one or two people without counting anyone', () => {
    expect(peopleLine(orderedPeople(people.slice(3), null))).toBe('Maya');
    expect(peopleLine(orderedPeople([people[3]!, people[0]!], null))).toBe('Maya and Sam');
  });
});

describe('meetingFacts', () => {
  const RECAP: SessionRecap = {
    sessionId: 's1',
    title: 'Roadmap',
    createdAt: '2026-09-01T00:00:00.000Z',
    startedAt: '2026-09-01T01:00:00.000Z',
    endedAt: '2026-09-01T03:35:00.000Z',
    leaderId: 'u1',
    participants: [{ userId: 'u1', displayName: 'Maya Chen', isLeader: true }],
    questions: [],
  };

  it('gives the length, the call and who led it', () => {
    const { facts } = meetingFacts(RECAP, { viewerId: 'u2', voiceEnabled: false });
    expect(facts.slice(1)).toEqual(['2 h 35 min', 'No call', 'Led by Maya Chen']);
    expect(meetingFacts(RECAP, { viewerId: 'u1' }).facts.at(-1)).toBe('Led by you');
  });

  it('gives only the end of a session that never started, and leaves the call out when unknown', () => {
    const { facts } = meetingFacts({ ...RECAP, startedAt: null }, { viewerId: null });
    expect(facts[0]).toMatch(/^Ended /);
    expect(facts).not.toContain('No call');
  });

  it('says how long in minutes, then hours', () => {
    expect(durationText(0)).toBe('1 min');
    expect(durationText(45)).toBe('45 min');
    expect(durationText(120)).toBe('2 h');
  });
});

describe('ideaWallLayout', () => {
  it('shows a handful at full size, a crowd smaller, and a dozen before Show all', () => {
    expect(ideaWallLayout(6)).toEqual({ compact: false, firstShown: 6 });
    expect(ideaWallLayout(7)).toEqual({ compact: true, firstShown: 7 });
    expect(ideaWallLayout(30)).toEqual({ compact: true, firstShown: 12 });
  });
});

describe('cards on a board', () => {
  it('finds a card shortlisted or not', () => {
    const other = sticky('z', 'Zulu');
    const question = q({ otherProposals: [other] });
    expect(findCard(question, 'b')?.id).toBe('b');
    expect(findCard(question, 'z')).toBe(other);
    expect(findCard(question, 'nope')).toBeNull();
    expect(findCard(question, null)).toBeNull();
  });

  it('says whose idea a card builds on', () => {
    const built = { ...sticky('x', 'More'), extendsFrom: { authorId: 'u9', authorName: 'Maya' } };
    expect(buildsOnText(built, null)).toBe('Builds on Maya’s idea');
    expect(buildsOnText(built, 'u9')).toBe('Builds on your idea');
    expect(buildsOnText(sticky('y', 'Plain'), null)).toBeNull();
  });
});
