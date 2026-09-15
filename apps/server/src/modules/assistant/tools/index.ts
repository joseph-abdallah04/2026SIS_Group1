// F36 — the three agent tools.
//
// Design note: `create_diagram` and `sticky_ideation` do not call the LLM again. The model
// already produced the content when it filled in the tool arguments; the tool's job is to
// validate that content, give it a deterministic layout/shape, and hand back a real
// artifact. That keeps one user turn to one LLM round trip per step and makes the tools
// unit-testable without a provider.
//
// Each tool is split in two:
//
//   - a `run*` function that is pure input → outcome, with no streaming and no SDK types,
//     which is what the unit tests exercise
//   - a thin `tool()` wrapper that reports the outcome to a per-turn sink and returns the
//     model-facing text
//
// The sink exists because artifacts must reach the client in a fixed order relative to the
// tool frames around them (`tool` → `artifact`… → `tool-result`). Emitting from inside
// `execute` would race the agent's own reading of the stream, so execution records what
// happened and the agent emits it when it sees the matching `tool-result`.
import {
  ASSISTANT_TOOL_NAMES,
  parseArtifact,
  STICKY_COLORS,
  summarizeArtifact,
  type AssistantToolName,
  type DiagramArtifact,
  type ArtifactJson,
  type StickyArtifact,
  type StickyColor,
  type WebSearchResult,
} from '@roundtable/shared';
import { tool, type ToolSet } from 'ai';
import { z } from 'zod';

import type { Agenda, SessionLookupData, SessionLookupReader } from '../sessionLookup.js';
import { quoteUntrustedBlock } from '../untrusted.js';
import { layoutDiagram } from './layout.js';
import { searchWeb } from './webSearch.js';

/** What a tool produced, in the terms the chat panel needs. */
export interface ToolOutcome {
  ok: boolean;
  /** One line for the UI's tool-result chip. */
  summary: string;
  /** Text handed back to the model as the tool message — this is what it reasons over. */
  modelText: string;
  /** Streamed to the client as `artifact` frames, each with a Propose button. */
  artifacts?: ArtifactJson[];
  results?: WebSearchResult[];
}

/** Collects outcomes during a turn so the agent can emit them in stream order. */
export class ToolOutcomeSink {
  private readonly outcomes = new Map<string, ToolOutcome>();

  record(toolCallId: string, outcome: ToolOutcome): void {
    this.outcomes.set(toolCallId, outcome);
  }

  /** Reads and forgets the outcome for a call. */
  take(toolCallId: string): ToolOutcome | undefined {
    const outcome = this.outcomes.get(toolCallId);
    this.outcomes.delete(toolCallId);
    return outcome;
  }
}

// ---------------------------------------------------------------------------
// web_search
// ---------------------------------------------------------------------------

const webSearchInput = z.object({
  query: z.string().min(1).max(300).describe('Search query, phrased as you would type it.'),
});

export async function runWebSearch(
  input: z.infer<typeof webSearchInput>,
  signal?: AbortSignal,
): Promise<ToolOutcome> {
  const outcome = await searchWeb(input.query, signal);

  if (outcome.results.length === 0) {
    return {
      ok: false,
      summary: 'No results',
      modelText:
        outcome.note ??
        'No results found. Tell the user search came back empty and answer from what you know, flagging the uncertainty.',
    };
  }

  const modelText = quoteUntrustedBlock(
    'web',
    outcome.results
      .map((result, index) => `[${index + 1}] ${result.title}\n${result.url}\n${result.snippet}`)
      .join('\n\n'),
  );

  return {
    ok: true,
    summary: `${outcome.results.length} result${outcome.results.length === 1 ? '' : 's'}`,
    modelText: outcome.note ? `${outcome.note}\n\n${modelText}` : modelText,
    results: outcome.results,
  };
}

// ---------------------------------------------------------------------------
// create_diagram
// ---------------------------------------------------------------------------

// Every rule here is one the board itself enforces. Anything stricter is a call the model
// gets rejected for writing something the pinboard would have accepted — and a rejected
// call produces no artifact at all, which the user sees as the tool simply not working.
// Node ids in particular were once restricted to `[A-Za-z0-9_-]`, so a flowchart with an
// id like "Enter Credentials" failed in full; the board asks only that an id be non-empty.
const createDiagramInput = z.object({
  nodes: z
    .array(
      z.object({
        id: z
          .string()
          .min(1)
          .max(64)
          .describe('Short unique id, e.g. "api" or "step1". Referenced by edges.'),
        label: z.string().min(1).max(120).describe('Text shown inside the box.'),
      }),
    )
    .min(2, 'A diagram needs at least two nodes')
    .max(24)
    .describe('Boxes in the diagram, 2-24 of them.'),
  edges: z
    .array(
      z.object({
        from: z.string().min(1).max(64),
        to: z.string().min(1).max(64),
        // Models routinely fill an optional field with null rather than omitting it, and
        // failing the whole diagram over that is not worth the strictness.
        label: z
          .string()
          .max(80)
          .nullish()
          .transform((value) => value ?? undefined)
          .describe('Optional text on the arrow.'),
      }),
    )
    .max(60)
    .default([])
    .describe('Arrows between nodes, referencing node ids.'),
});

export function runCreateDiagram(input: z.infer<typeof createDiagramInput>): ToolOutcome {
  const ids = new Set(input.nodes.map((node) => node.id));
  const dangling = input.edges.find((edge) => !ids.has(edge.from) || !ids.has(edge.to));
  if (dangling) {
    return {
      ok: false,
      summary: 'Invalid diagram',
      modelText: `Edge ${dangling.from} → ${dangling.to} references a node id that is not in the nodes array. Call create_diagram again with matching ids.`,
    };
  }

  // The board's write path rejects self-edges and repeated directed edges, and a model
  // describing the same relationship twice produces both routinely. Those are the model
  // being sloppy, not the user being wrong, so they are cleaned up here rather than
  // surfaced as a Propose that fails in the user's hand. Node ids and dangling edges are
  // checked separately, because those mean the model got the *structure* wrong and it
  // should be told to try again.
  const edges = dropRedundantEdges(input.edges);

  const candidate: DiagramArtifact = {
    type: 'diagram',
    nodes: layoutDiagram(input.nodes, edges),
    edges,
  };

  const parsed = parseArtifact(candidate);
  if (!parsed.ok) {
    return {
      ok: false,
      summary: 'Invalid diagram',
      modelText: `Diagram rejected: ${parsed.error}`,
    };
  }

  return {
    ok: true,
    summary: `Diagram: ${candidate.nodes.length} nodes`,
    modelText: `Diagram created and shown to the user (${summarizeArtifact(parsed.artifact)}). They can propose it to the pinboard with one click — do not repeat the diagram as text.`,
    artifacts: [parsed.artifact],
  };
}

// ---------------------------------------------------------------------------
// sticky_ideation
// ---------------------------------------------------------------------------

const stickyIdeationInput = z.object({
  ideas: z
    .array(
      z.object({
        text: z
          .string()
          .min(1)
          .max(280)
          .describe('The note text — one idea, ideally under 20 words.'),
        color: z.enum(STICKY_COLORS).optional(),
      }),
    )
    .min(1)
    .max(8)
    .describe('Three to five distinct ideas.'),
});

export function runStickyIdeation(input: z.infer<typeof stickyIdeationInput>): ToolOutcome {
  // Cap at five: more than that stops being a shortlist and starts being a wall.
  const ideas = input.ideas.slice(0, 5);
  const accepted: StickyArtifact[] = [];
  const artifacts: ArtifactJson[] = [];
  const rejected: string[] = [];

  ideas.forEach((idea, index) => {
    const candidate: StickyArtifact = {
      type: 'sticky',
      text: idea.text.trim(),
      color: idea.color ?? rotateColor(index),
    };
    const parsed = parseArtifact(candidate);
    if (parsed.ok) {
      accepted.push(parsed.artifact as StickyArtifact);
      artifacts.push(parsed.artifact);
    } else {
      rejected.push(parsed.error);
    }
  });

  if (accepted.length === 0) {
    return {
      ok: false,
      summary: 'No usable notes',
      modelText: `Every sticky note was rejected: ${rejected.join('; ')}`,
    };
  }

  return {
    ok: true,
    summary: `${accepted.length} sticky note${accepted.length === 1 ? '' : 's'}`,
    modelText: `${accepted.length} sticky notes created and shown to the user: ${accepted
      .map((sticky) => `"${sticky.text}"`)
      .join(
        ', ',
      )}. They can propose any of them with one click — introduce them in a sentence rather than listing them again.`,
    artifacts,
  };
}

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// look_up_session
// ---------------------------------------------------------------------------

const lookUpSessionInput = z.object({
  what: z
    .enum(['agenda', 'proposals', 'answers'])
    .describe(
      'agenda: every question and its status. proposals: what is on the pinboard for a question. answers: what the settled questions were decided on.',
    ),
  question: z
    .number()
    .int()
    .min(1)
    .max(200)
    .nullish()
    .transform((value) => value ?? undefined)
    .describe(
      'Which question to read, numbered from 1 as the agenda numbers them. Leave it out for the question being discussed now.',
    ),
});

export function runLookUpSession(
  input: z.infer<typeof lookUpSessionInput>,
  data: SessionLookupData,
): ToolOutcome {
  const outcome = (() => {
    switch (input.what) {
      case 'agenda':
        return describeAgenda(data.agenda);
      case 'proposals':
        return describeProposals(data);
      case 'answers':
        return describeAnswers(data);
    }
  })();
  return { ...outcome, modelText: quoteUntrustedBlock('session', outcome.modelText) };
}

function describeAgenda(agenda: Agenda): ToolOutcome {
  if (agenda.questions.length === 0) {
    return {
      ok: true,
      summary: 'No questions yet',
      modelText: `"${agenda.title}" has no questions on its agenda yet.`,
    };
  }

  // Formatted as the session-context block formats it, so the agenda does not appear to
  // have changed shape between the prompt the model was given and the tool it just called.
  const lines = agenda.questions.map(
    (question) =>
      `${question.number}. [${question.status}] ${question.text}${question.isCurrent ? ' ← the team is on this one now' : ''}`,
  );

  return {
    ok: true,
    summary: `${agenda.questions.length} question${agenda.questions.length === 1 ? '' : 's'}`,
    modelText: `Agenda for "${agenda.title}":\n${lines.join('\n')}`,
  };
}

function describeProposals(data: SessionLookupData): ToolOutcome {
  const found = data.proposals;
  if (!found) {
    return {
      ok: false,
      summary: 'No such question',
      modelText:
        'There is no question with that number on the agenda. Look up the agenda first to see how many there are.',
    };
  }

  const { question, items } = found;
  const where = `question ${question.number}, "${question.text}"`;

  if (items.length === 0) {
    return {
      ok: true,
      summary: 'Nothing on it',
      modelText: `Nothing has been proposed on ${where} — the board for it is empty.`,
    };
  }

  const lines = items.map((item) => `  - [${item.type}] ${item.summary} — ${item.author}`);
  return {
    ok: true,
    summary: `${items.length} proposal${items.length === 1 ? '' : 's'}`,
    modelText: `On ${where}:\n${lines.join('\n')}`,
  };
}

function describeAnswers(data: SessionLookupData): ToolOutcome {
  const answers = data.answers ?? [];
  if (answers.length === 0) {
    return {
      ok: true,
      summary: 'Nothing settled yet',
      modelText:
        'No question has been settled yet — nothing has been answered or skipped so far in this session.',
    };
  }

  const lines = answers.map(({ question, winner }) => {
    if (question.status === 'skipped') {
      return `${question.number}. "${question.text}" — skipped, never answered.`;
    }
    if (!winner) {
      return `${question.number}. "${question.text}" — answered, but no single proposal won (a tie, or the winner has since been removed).`;
    }
    return `${question.number}. "${question.text}" — answered with [${winner.type}] ${winner.summary}, by ${winner.author}.`;
  });

  return {
    ok: true,
    summary: `${answers.length} settled`,
    modelText: `What this session has settled so far:\n${lines.join('\n')}`,
  };
}

/**
 * Builds the tool set for one turn, bound to the sink that collects what each call
 * produced.
 *
 * Failures are caught and returned as text rather than thrown: a flaky search should let
 * the model explain itself and carry on, not kill the turn the user is waiting on.
 */
export function createAssistantTools(sink: ToolOutcomeSink, lookup?: SessionLookupReader): ToolSet {
  const record = (toolCallId: string, outcome: ToolOutcome): string => {
    sink.record(toolCallId, outcome);
    return outcome.modelText;
  };

  return {
    // Offered only where there is a session to read. Outside one — an eval, a unit test —
    // there is nothing to look up, and a tool that can only fail is worse than no tool.
    ...(lookup
      ? {
          look_up_session: tool({
            description:
              "Read this session's own state: the agenda and every question's status, what has been proposed on any question, or what the settled questions were decided on. Use it whenever an answer depends on where the team has got to — and never ask the user for something you could read here.",
            inputSchema: lookUpSessionInput,
            execute: async (input, { toolCallId }) =>
              record(
                toolCallId,
                await guard('look_up_session', async () => {
                  const data = await lookup.read(input.what, input.question);
                  if (!data) {
                    return {
                      ok: false,
                      summary: 'Session unavailable',
                      modelText:
                        'The session could not be read just now. Say so rather than guessing at its state.',
                    };
                  }
                  return runLookUpSession(input, data);
                }),
              ),
          }),
        }
      : {}),

    web_search: tool({
      description:
        'Search the public web for current facts, comparisons, prices, docs or prior art. Use it when the answer depends on information you do not reliably know, and cite the sources you use.',
      inputSchema: webSearchInput,
      execute: async (input, { toolCallId, abortSignal }) =>
        record(toolCallId, await guard('web_search', () => runWebSearch(input, abortSignal))),
    }),

    create_diagram: tool({
      description:
        'Draw a node-and-arrow diagram (architecture, flow, sequence of steps, decision tree) that the user can propose onto the pinboard. Give structure only — positions are computed for you. Use this ONLY when a picture answers the question better than a sentence would.',
      inputSchema: createDiagramInput,
      execute: async (input, { toolCallId }) =>
        record(toolCallId, await guard('create_diagram', () => runCreateDiagram(input))),
    }),

    sticky_ideation: tool({
      description:
        'Turn ideas into 3–5 candidate sticky notes the user can propose onto the pinboard. Each note should stand alone as one idea, phrased tightly enough to read at a glance. Use this ONLY when the user is asking for notes, options or a brainstorm to put on the board — an ordinary question wants a prose answer, even if an earlier message in the conversation asked for sticky notes.',
      inputSchema: stickyIdeationInput,
      execute: async (input, { toolCallId }) =>
        record(toolCallId, await guard('sticky_ideation', () => runStickyIdeation(input))),
    }),
  };
}

/** Turns a thrown tool into an outcome the model can read and recover from. */
async function guard(
  name: AssistantToolName,
  run: () => ToolOutcome | Promise<ToolOutcome>,
): Promise<ToolOutcome> {
  try {
    return await run();
  } catch (cause) {
    if (cause instanceof Error && cause.name === 'AbortError') throw cause;
    const detail = cause instanceof Error ? cause.message : 'unknown error';
    return {
      ok: false,
      summary: 'Tool failed',
      modelText: `${name} failed: ${detail}. Continue without it and tell the user what you could not do.`,
    };
  }
}

/** Cycles the palette so a batch of notes is visually distinguishable by default. */
function rotateColor(index: number): StickyColor {
  return STICKY_COLORS[index % STICKY_COLORS.length] as StickyColor;
}

/**
 * Removes edges the pinboard's write path would reject: a node pointing at itself, and the
 * same directed pair listed more than once. Order is preserved, so the diagram still reads
 * the way the model wrote it.
 */
function dropRedundantEdges<T extends { from: string; to: string }>(edges: T[]): T[] {
  const seen = new Set<string>();
  return edges.filter((edge) => {
    if (edge.from === edge.to) return false;
    const key = `${edge.from}\u0000${edge.to}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Narrows a tool name off the stream to the union the stream events are typed with. */
export function isAssistantToolName(name: string): name is AssistantToolName {
  return (ASSISTANT_TOOL_NAMES as readonly string[]).includes(name);
}
