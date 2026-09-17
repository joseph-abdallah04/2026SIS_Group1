/**
 * One demo session used across the landing page. Every mock — lobby, board,
 * ballot, assistant, recap — is this room, so the page reads as a single
 * meeting rather than a pile of unrelated slogans.
 */
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

export const DEMO_SHORTLIST: {
  text: string;
  votes: number;
  share: number;
  winner?: boolean;
}[] = [
  { text: 'Provision accounts the day the offer is signed', votes: 2, share: 33 },
  {
    text: 'Seeded demo workspace, ready before they sit down',
    votes: 3,
    share: 50,
    winner: true,
  },
  { text: 'One setup script instead of a twelve-page wiki', votes: 1, share: 17 },
];
