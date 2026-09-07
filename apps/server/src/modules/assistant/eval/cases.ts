// What the assistant is supposed to do, as checkable cases.
//
// These are behaviour regressions, not unit tests: every one of them is something that was
// actually wrong at some point, or something a prompt edit could plausibly break. Unit tests
// cannot catch any of it, because the thing under test is a model's judgement.
import type { ArtifactJson, AssistantHistoryMessage, AssistantToolName } from '@roundtable/shared';

export interface EvalCase {
  id: string;
  /** Why this case exists — printed with the failure so it is obvious what regressed. */
  rationale: string;
  message: string;
  history?: AssistantHistoryMessage[];
  /** Extra lines injected into the system prompt's session-context block. */
  contextBlock?: string;
  /** The tool the model should reach for, or 'none' when the message wants a plain answer. */
  expectTool: AssistantToolName | 'none';
  expectArtifacts?: { type: ArtifactJson['type']; min: number };
  /** Case-insensitive substrings the reply should contain. */
  expectMentions?: string[];
}

const AFTER_STICKIES: AssistantHistoryMessage[] = [
  { role: 'user', content: 'Give me 5 sticky notes for this question' },
  {
    role: 'assistant',
    content:
      '(Created 5 stickys for the user; they are already on screen.) Here are five angles to start from.',
  },
];

const BOARD = `Session: Pick a database
Active question: What should we use for the MVP? (phase: discussion)
Recent proposals:
- sticky by Alice: Postgres — boring and everyone knows it
- sticky by Bob: SQLite for the demo, migrate later
- sticky by Alice: Managed Neon so nobody runs a server`;

export const EVAL_CASES: EvalCase[] = [
  {
    id: 'prose/plain-question',
    rationale: 'A question wants an answer. The prompt used to say "prefer tools over prose".',
    message: 'What does MVP actually mean in a university capstone?',
    expectTool: 'none',
  },
  {
    id: 'prose/after-stickies',
    rationale:
      'The fixation bug: once asked for sticky notes, every later message came back as sticky notes.',
    message: 'Which of those would you pick, and why?',
    history: AFTER_STICKIES,
    expectTool: 'none',
  },
  {
    id: 'prose/greeting',
    rationale: 'A greeting is not a brainstorming request.',
    message: 'hey',
    expectTool: 'none',
  },
  {
    id: 'context/reads-the-board',
    rationale: 'F35: the assistant must answer from the board, not guess.',
    message: 'What have we proposed so far?',
    contextBlock: BOARD,
    expectTool: 'none',
    expectMentions: ['postgres', 'sqlite'],
  },
  {
    id: 'tool/sticky-ideation',
    rationale: 'F36: an explicit request for notes should produce notes.',
    message: 'Give me 5 sticky notes of ideas for this question',
    contextBlock: BOARD,
    expectTool: 'sticky_ideation',
    expectArtifacts: { type: 'sticky', min: 3 },
  },
  {
    id: 'tool/diagram',
    rationale: 'F36: a request for a diagram should produce one, not a description of one.',
    message: 'Draw a diagram of how a request flows from the browser to the database',
    expectTool: 'create_diagram',
    expectArtifacts: { type: 'diagram', min: 1 },
  },
  {
    id: 'tool/web-search',
    rationale: 'F36: a question about current fact should search rather than answer from memory.',
    message: 'What is the current stable version of Socket.IO?',
    expectTool: 'web_search',
  },
  {
    id: 'tool/no-search-for-local-question',
    rationale: 'Searching the web for what is already on the board wastes the user’s tokens.',
    message: 'Summarise the proposals on the board in one sentence.',
    contextBlock: BOARD,
    expectTool: 'none',
  },
];
