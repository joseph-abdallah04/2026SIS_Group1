/**
 * One demo session used across the landing page. Every mock — lobby, board,
 * ballot, assistant, recap — is this room, so the page reads as a single
 * meeting rather than a pile of unrelated slogans.
 *
 * Ballot and recap previews are real `BoardItem`s so they can sit in the same
 * cards, rings and summary chrome the product uses.
 */
import type {
  BoardItem,
  DiagramEdge,
  DiagramNode,
  SessionRecap,
  StickyColor,
  VotingTally,
} from '@roundtable/shared';

export const DEMO = {
  title: 'Cut onboarding to one day',
  team: 'Product & platform',
  joinCode: 'K7NP-3WQZ',
  currentQuestion: 'How do we get a new engineer productive on day one?',
};

export const DEMO_SEATS: { name: string; leader?: boolean; speaking?: boolean }[] = [
  { name: 'Mira H.', leader: true },
  { name: 'Alex C.', speaking: true },
  { name: 'Elena N.' },
  { name: 'Tom W.' },
  { name: 'Aisha B.' },
  { name: 'Priya S.' },
];

export const DEMO_QUESTIONS: { text: string; answer: string }[] = [
  {
    text: 'How do we get a new engineer productive on day one?',
    answer: 'Seeded demo workspace, ready before they sit down',
  },
  {
    text: 'What should the first morning look like?',
    answer: 'Named buddy, fifteen minutes a day, for the first week',
  },
  {
    text: 'Who owns the laptop image and welcome kit?',
    answer: 'People ops owns it; Engineering reviews the image each quarter',
  },
];

const DEMO_AT = '2026-09-17T04:18:00.000Z';

const PEOPLE = {
  mira: { userId: 'mira', displayName: 'Mira H.' },
  alex: { userId: 'alex', displayName: 'Alex C.' },
  elena: { userId: 'elena', displayName: 'Elena N.' },
  tom: { userId: 'tom', displayName: 'Tom W.' },
  aisha: { userId: 'aisha', displayName: 'Aisha B.' },
  priya: { userId: 'priya', displayName: 'Priya S.' },
} as const;

function demoSticky(input: {
  id: string;
  questionId: string;
  author: (typeof PEOPLE)[keyof typeof PEOPLE];
  text: string;
  color: StickyColor;
  createdAt: string;
  reactions?: BoardItem['reactions'];
}): BoardItem {
  return {
    id: input.id,
    questionId: input.questionId,
    authorId: input.author.userId,
    authorName: input.author.displayName,
    type: 'sticky',
    artifactJson: { type: 'sticky', text: input.text, color: input.color },
    x: 0,
    y: 0,
    z: 0,
    createdAt: input.createdAt,
    editedAt: null,
    extendsProposalId: null,
    extendsFrom: null,
    reactions: input.reactions ?? [],
  };
}

function demoDiagram(input: {
  id: string;
  questionId: string;
  author: (typeof PEOPLE)[keyof typeof PEOPLE];
  createdAt: string;
  nodes: DiagramNode[];
  edges: DiagramEdge[];
}): BoardItem {
  return {
    id: input.id,
    questionId: input.questionId,
    authorId: input.author.userId,
    authorName: input.author.displayName,
    type: 'diagram',
    artifactJson: { type: 'diagram', nodes: input.nodes, edges: input.edges },
    x: 0,
    y: 0,
    z: 0,
    createdAt: input.createdAt,
    editedAt: null,
    extendsProposalId: null,
    extendsFrom: null,
    reactions: [],
  };
}

export const DEMO_PINBOARD_STICKIES: BoardItem[] = [
  demoSticky({
    id: 'p-accounts',
    questionId: 'q1',
    author: PEOPLE.mira,
    text: 'Provision accounts the day the offer is signed',
    color: 'yellow',
    createdAt: '2026-09-17T04:08:00.000Z',
    reactions: [{ emoji: '👍', userIds: ['alex', 'elena', 'tom'] }],
  }),
  demoSticky({
    id: 'p-workspace',
    questionId: 'q1',
    author: PEOPLE.elena,
    text: 'Seeded demo workspace, ready before they sit down',
    color: 'blue',
    createdAt: '2026-09-17T04:11:00.000Z',
    reactions: [{ emoji: '👍', userIds: ['mira', 'alex', 'tom', 'aisha', 'priya'] }],
  }),
  demoSticky({
    id: 'p-script',
    questionId: 'q1',
    author: PEOPLE.alex,
    text: 'One setup script instead of a twelve-page wiki',
    color: 'pink',
    createdAt: '2026-09-17T04:14:00.000Z',
  }),
];

export const DEMO_FLOW_DIAGRAM = demoDiagram({
  id: 'p-flow',
  questionId: 'q1',
  author: PEOPLE.alex,
  createdAt: '2026-09-17T04:13:00.000Z',
  nodes: [
    {
      id: 'offer',
      label: 'Offer signed',
      x: 8,
      y: 88,
      shape: 'ellipse',
      fillColor: 'amber',
    },
    {
      id: 'ops',
      label: 'People ops',
      x: 160,
      y: 52,
      shape: 'box',
      fillColor: 'rose',
    },
    {
      id: 'it',
      label: 'Accounts',
      x: 156,
      y: 140,
      shape: 'cylinder',
      fillColor: 'blue',
    },
    { id: 'ready', label: 'Ready?', x: 312, y: 48, shape: 'diamond' },
    {
      id: 'dayone',
      label: 'Day one',
      x: 316,
      y: 152,
      shape: 'ellipse',
      fillColor: 'green',
    },
  ],
  edges: [
    { from: 'offer', to: 'ops' },
    { from: 'offer', to: 'it' },
    { from: 'ops', to: 'ready' },
    { from: 'it', to: 'ready' },
    { from: 'ready', to: 'dayone', label: 'yes' },
  ],
});

const morningDiagram = demoDiagram({
  id: 'p-morning',
  questionId: 'q1',
  author: PEOPLE.aisha,
  createdAt: '2026-09-17T04:15:00.000Z',
  nodes: [
    { id: 'desk', label: 'Desk ready', x: 92, y: 8, shape: 'ellipse' },
    { id: 'buddy', label: 'Named buddy', x: 8, y: 140, shape: 'box' },
    { id: 'pr', label: 'First PR', x: 176, y: 140, shape: 'box' },
  ],
  edges: [
    { from: 'desk', to: 'buddy' },
    { from: 'desk', to: 'pr' },
  ],
});

/** Shortlist for the voting preview: two stickies, two diagrams, in 2×2 order. */
export const DEMO_BALLOT_ITEMS: BoardItem[] = [
  DEMO_PINBOARD_STICKIES[0]!,
  DEMO_FLOW_DIAGRAM,
  morningDiagram,
  DEMO_PINBOARD_STICKIES[1]!,
];

export const DEMO_BALLOT_TALLIES: VotingTally[] = [
  { proposalId: DEMO_PINBOARD_STICKIES[0]!.id, votes: 1, percent: 17 },
  { proposalId: DEMO_FLOW_DIAGRAM.id, votes: 1, percent: 17 },
  { proposalId: morningDiagram.id, votes: 1, percent: 16 },
  { proposalId: DEMO_PINBOARD_STICKIES[1]!.id, votes: 3, percent: 50 },
];

export const DEMO_WINNER_ID = DEMO_PINBOARD_STICKIES[1]!.id;

export const DEMO_PAIR_STICKY: BoardItem = demoSticky({
  id: 'p-pr',
  questionId: 'q1',
  author: PEOPLE.aisha,
  text: 'Pair on the first pull request before lunch',
  color: 'green',
  createdAt: '2026-09-17T04:16:00.000Z',
});

const q2Winner = demoSticky({
  id: 'p-buddy',
  questionId: 'q2',
  author: PEOPLE.aisha,
  text: DEMO_QUESTIONS[1]!.answer,
  color: 'green',
  createdAt: '2026-09-17T04:22:00.000Z',
});

const q3Winner = demoSticky({
  id: 'p-image',
  questionId: 'q3',
  author: PEOPLE.tom,
  text: DEMO_QUESTIONS[2]!.answer,
  color: 'yellow',
  createdAt: '2026-09-17T04:31:00.000Z',
});

export const DEMO_RECAP: SessionRecap = {
  sessionId: 'demo',
  title: DEMO.title,
  createdAt: '2026-09-17T03:40:00.000Z',
  startedAt: '2026-09-17T04:02:00.000Z',
  endedAt: DEMO_AT,
  leaderId: PEOPLE.mira.userId,
  participants: DEMO_SEATS.map((seat) => {
    const person = Object.values(PEOPLE).find((row) => row.displayName === seat.name);
    return {
      userId: person?.userId ?? seat.name,
      displayName: seat.name,
      isLeader: Boolean(seat.leader),
    };
  }),
  questions: [
    {
      id: 'q1',
      position: 0,
      text: DEMO_QUESTIONS[0]!.text,
      status: 'answered',
      proposals: DEMO_BALLOT_ITEMS,
      winnerProposalId: DEMO_WINNER_ID,
      tiedProposalIds: [],
      tallies: DEMO_BALLOT_TALLIES,
      votedCount: DEMO_SEATS.length,
    },
    {
      id: 'q2',
      position: 1,
      text: DEMO_QUESTIONS[1]!.text,
      status: 'answered',
      proposals: [q2Winner],
      winnerProposalId: q2Winner.id,
      tiedProposalIds: [],
      tallies: [{ proposalId: q2Winner.id, votes: 6, percent: 100 }],
      votedCount: DEMO_SEATS.length,
    },
    {
      id: 'q3',
      position: 2,
      text: DEMO_QUESTIONS[2]!.text,
      status: 'answered',
      proposals: [q3Winner],
      winnerProposalId: q3Winner.id,
      tiedProposalIds: [],
      tallies: [{ proposalId: q3Winner.id, votes: 5, percent: 100 }],
      votedCount: 5,
    },
  ],
};
