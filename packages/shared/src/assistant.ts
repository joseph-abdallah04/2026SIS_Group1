// AI Assistant contracts (F33–F37) — shared by the SSE endpoint and the chat panel.
//
// Owner: AI Assistant module (docs/06). The assistant is per-user and private: nothing
// here is broadcast to a session room (docs/02 §8.8).
import { z } from 'zod';

import type { ArtifactJson, StickyColor } from './index.js';
import {
  artifactWriteJsonSchema,
  diagramWriteArtifactSchema,
  drawingWriteArtifactSchema,
  stickyWriteArtifactSchema,
} from './schemas.js';

// ---------------------------------------------------------------------------
// Artifact helpers the agent needs
//
// The artifact *shapes* belong to the pinboard/tools modules (see the pinboard section of
// index.ts). These are the extra bits only the assistant needs: a value-level colour list
// for the sticky tool to rotate through, and one validation gate for model-generated
// content on its way to the board.
// ---------------------------------------------------------------------------

// `as const` matters: zod's `z.enum` needs a tuple, not a widened array, and indexing it
// yields StickyColor rather than string.
export const STICKY_COLORS = [
  'yellow',
  'pink',
  'blue',
  'green',
] as const satisfies readonly StickyColor[];

/** Hard ceiling on a serialized artifact (docs/02 §8.5) — keeps jsonb rows and frames sane. */
export const MAX_ARTIFACT_BYTES = 100_000;

export type ArtifactParseResult =
  { ok: true; artifact: ArtifactJson } | { ok: false; error: string };

/**
 * Validates an artifact the model produced, before it is shown with a Propose button.
 *
 * Deliberately the *write* schema, not the lenient read one: everything the agent makes is
 * a candidate for the board, so it is held to the rules `proposalCreate` enforces — no
 * dangling edges, no duplicate node ids. Failing here means the model can be told to fix
 * it; failing at the board means the Propose button breaks in the user's hand.
 *
 * The pinboard revalidates on the way in — this is not a substitute for that. It exists so
 * a malformed tool call fails inside the chat, where the model can be told to fix it, and
 * never reaches the point of being offered to the user.
 */
export function parseArtifact(input: unknown): ArtifactParseResult {
  const parsed = artifactWriteJsonSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: describeIssues(parsed.error.issues) };
  // A picture is something a person brings to the board. The agent has none of
  // its own to bring, and a model asked to "make an image" would be inventing
  // the bytes of one.
  if (parsed.data.type === 'image') {
    return { ok: false, error: 'The assistant cannot propose images' };
  }

  const size = new TextEncoder().encode(JSON.stringify(parsed.data)).length;
  if (size > MAX_ARTIFACT_BYTES) {
    return { ok: false, error: `Artifact is ${size} bytes; limit is ${MAX_ARTIFACT_BYTES}` };
  }

  // The cross-field rules, run from the same schemas `proposalCreateSchema` uses rather
  // than restated here. `artifactWriteJsonSchema` is a discriminated union and can only
  // carry field-level rules, so on its own it accepts a diagram the board will reject.
  //
  // These once lived here as a hand-written id-and-edge check, which is exactly the kind
  // of copy that goes quietly stale: the creative tools have since grown containers,
  // paired node sizes, and a rule against self-edges and repeated arrows, none of which
  // the copy knew about. Sharing the schema means a tool the team tightens tomorrow
  // tightens what the agent may produce, in the chat, where the model can be told to fix
  // it — instead of in the user's hand when they press Propose.
  const writeSchema =
    parsed.data.type === 'diagram'
      ? diagramWriteArtifactSchema
      : parsed.data.type === 'drawing'
        ? drawingWriteArtifactSchema
        : stickyWriteArtifactSchema;

  const written = writeSchema.safeParse(parsed.data);
  if (!written.success) return { ok: false, error: describeIssues(written.error.issues) };

  return { ok: true, artifact: parsed.data };
}

function describeIssues(issues: readonly z.ZodIssue[]): string {
  return issues
    .map((issue) => {
      const path = issue.path.join('.');
      return path ? `${path}: ${issue.message}` : issue.message;
    })
    .join('; ');
}

/** One-line human summary — used in chat and in the agent's own context block. */
export function summarizeArtifact(artifact: ArtifactJson): string {
  switch (artifact.type) {
    case 'sticky':
      return artifact.text.length > 80 ? `${artifact.text.slice(0, 77)}…` : artifact.text;
    case 'drawing':
      return 'Freehand drawing';
    case 'diagram':
      return summarizeDiagram(artifact);
    case 'image':
      return 'Image';
  }
}

/**
 * What is on a canvas, in the words the agent is told the board in.
 *
 * Counted across everything the studio can draw, not just boxes and arrows
 * between them. The agent's own diagrams are nodes and edges and nothing else,
 * but the people it is working with have a canvas that also holds tables,
 * standalone arrows, freehand ink and drawn paths — and a canvas made entirely
 * of those summarised as "0 nodes, 0 edges", which reads to the agent as an
 * empty board and is the one thing it must not think.
 */
function summarizeDiagram(artifact: Extract<ArtifactJson, { type: 'diagram' }>): string {
  const parts: string[] = [];
  const count = (n: number, one: string, many: string) => {
    if (n > 0) parts.push(`${n} ${n === 1 ? one : many}`);
  };

  count(artifact.nodes.length, 'node', 'nodes');
  count(artifact.edges.length, 'edge', 'edges');
  count(artifact.tables?.length ?? 0, 'table', 'tables');
  // The edges above join two boxes; these are drawn on their own, so they are
  // arrows rather than more edges.
  count(artifact.arrows?.length ?? 0, 'arrow', 'arrows');
  count(artifact.paths?.length ?? 0, 'shape', 'shapes');
  count(artifact.ink?.length ?? 0, 'sketch', 'sketches');

  return parts.length > 0 ? parts.join(', ') : 'Empty canvas';
}

// ---------------------------------------------------------------------------
// F33 — per-user LLM provider configuration
// ---------------------------------------------------------------------------

/**
 * What the user types into Settings. Any OpenAI-compatible `/chat/completions`
 * endpoint works: OpenAI, Groq, OpenRouter, Ollama, LM Studio, vLLM…
 */
export const llmConfigInputSchema = z.object({
  baseUrl: z
    .string()
    .url('Must be a full URL, e.g. https://api.openai.com/v1')
    .max(300)
    .refine((url) => /^https?:\/\//i.test(url), 'Base URL must use http(s)'),
  apiKey: z.string().min(1, 'API key is required').max(400),
  model: z.string().min(1, 'Model name is required').max(120),
});
export type LlmConfigInput = z.infer<typeof llmConfigInputSchema>;

/**
 * Saving over an existing config. The key is optional here: it can never be read back from
 * the server, so requiring it on every save would mean re-pasting a secret just to change
 * the model — which is exactly what you do when a provider retires one. Omit it and the
 * stored key is kept; supply it to replace the key.
 */
export const llmConfigUpsertSchema = llmConfigInputSchema.extend({
  apiKey: z.string().min(1).max(400).optional(),
});
export type LlmConfigUpsert = z.infer<typeof llmConfigUpsertSchema>;

/**
 * What the API gives back. The key is **never** returned after saving (docs/05 §8) —
 * `hasKey` is the only thing the UI needs to know about it.
 */
export interface LlmConfigPublic {
  baseUrl: string;
  model: string;
  hasKey: boolean;
}

/** Result of "Test connection". `null` config or a bad key both surface as ok:false. */
export interface LlmConfigTestResult {
  ok: boolean;
  error?: string;
  /** Why the test failed, as one of the `ASSISTANT_ERRORS` codes. */
  code?: string;
  /** What the provider actually said, when it said something. */
  detail?: string;
  /** Round-trip latency in ms when the probe succeeded. */
  latencyMs?: number;
  /** Model string the provider echoed back, when it differs from what was requested. */
  model?: string;
}

/** Handy presets for the settings form — purely a UI convenience, no behaviour attached. */
// Model ids go stale — Groq shut down llama-3.3-70b-versatile on 2026-08-16 with about a
// month's notice. If a preset stops working, check the provider's deprecations page rather
// than their model list; the list lags.
export const LLM_PROVIDER_PRESETS = [
  { label: 'OpenAI', baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini' },
  { label: 'Groq', baseUrl: 'https://api.groq.com/openai/v1', model: 'openai/gpt-oss-120b' },
  { label: 'OpenRouter', baseUrl: 'https://openrouter.ai/api/v1', model: 'openai/gpt-4o-mini' },
  { label: 'Ollama (local)', baseUrl: 'http://localhost:11434/v1', model: 'llama3.1' },
  { label: 'LM Studio (local)', baseUrl: 'http://localhost:1234/v1', model: 'local-model' },
] as const;

// ---------------------------------------------------------------------------
// F36 — agent tools
//
// Declared ahead of the F35 history contract below, which names the tools a past turn
// tried and failed to run.
// ---------------------------------------------------------------------------

export const ASSISTANT_TOOL_NAMES = [
  'web_search',
  'create_diagram',
  'sticky_ideation',
  'look_up_session',
] as const;
export type AssistantToolName = (typeof ASSISTANT_TOOL_NAMES)[number];

export interface WebSearchResult {
  title: string;
  url: string;
  snippet: string;
}

// ---------------------------------------------------------------------------
// F35 — session context sent with each chat turn
// ---------------------------------------------------------------------------

/**
 * The little the client is allowed to tell the server about a turn.
 *
 * This used to carry the session title, the active question and a summary of every recent
 * proposal, and the server rendered all of it straight into the prompt. That made the
 * request body an editor for the assistant's view of reality: a member could invent
 * proposals, rename the question, or attribute a quote to a teammate, and the model would
 * repeat it back to the room as fact.
 *
 * So the session's facts are now read server-side, from the same services the board reads,
 * and the only thing left here is a statement about the user's *screen* — which the server
 * genuinely cannot know, and which is safe because it is only ever used to annotate a
 * proposal the server already loaded. A forged id annotates nothing.
 */
export const assistantContextSchema = z.object({
  /** Which card the user has selected, so "this one" in a question means something. */
  selectedProposalId: z.string().max(64).optional(),
});
export type AssistantContext = z.infer<typeof assistantContextSchema>;

/**
 * One past turn.
 *
 * `content` is only ever what was actually said. What a turn *did* — the artifacts it
 * produced, the tools that failed, whether the user cancelled it — rides alongside as
 * structured fields, and the server renders it into the instructions rather than into
 * the conversation.
 *
 * That split is not tidiness. These facts used to be prepended to the assistant's own
 * words as "(Created 1 diagram for the user; they are already on screen.) …", and small
 * models copy the shape of their own last turn: the note came back out as visible chat,
 * and with it the claim that a diagram existed — on turns where the tool had failed, or
 * had never been called at all. A fact the model reads about itself is far harder to
 * mistake for a sentence it is supposed to write.
 */
export const assistantHistoryMessageSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string().max(8000),
  /** Artifact types this turn actually produced and showed to the user. */
  artifacts: z
    .array(z.enum(['sticky', 'drawing', 'diagram', 'image']))
    .max(20)
    .optional(),
  /** Tools this turn called that failed, producing nothing. */
  failedTools: z.array(z.enum(ASSISTANT_TOOL_NAMES)).max(8).optional(),
  /** True when the user pressed stop before this reply finished. */
  interrupted: z.boolean().optional(),
});
export type AssistantHistoryMessage = z.infer<typeof assistantHistoryMessageSchema>;

/** Body of `POST /api/sessions/:id/assistant/chat`. */
export const assistantChatRequestSchema = z.object({
  message: z.string().min(1, 'Message is required').max(4000),
  context: assistantContextSchema.optional().default({}),
  /** Prior turns, oldest first. The client owns chat history; the server stores nothing. */
  history: z.array(assistantHistoryMessageSchema).max(20).optional().default([]),
});
export type AssistantChatRequest = z.infer<typeof assistantChatRequestSchema>;

// ---------------------------------------------------------------------------
// SSE stream events (assistant owner's "Also owns" item 1, docs/06)
// ---------------------------------------------------------------------------

/**
 * Token accounting for one turn.
 *
 * Every field is optional because it is the provider that decides what to report, and
 * plenty of OpenAI-compatible servers report nothing at all. Treat a missing number as
 * "unknown", never as zero — a cost display that silently reads 0 is worse than one that
 * admits it does not know.
 */
export interface AssistantUsage {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  /** Portion of the output spent on hidden reasoning, where the provider separates it. */
  reasoningTokens?: number;
  /** Portion of the input served from the provider's prompt cache, billed at a discount. */
  cachedInputTokens?: number;
  /** Model round trips in the turn — one per step of the tool loop. */
  steps: number;
  /** Wall-clock time from the first request to the last frame. */
  durationMs: number;
}

/**
 * One frame of the assistant response stream.
 *
 * Note on `message`: `content` is an **incremental delta** — append it to the message
 * being rendered. That is what makes the reply appear as the LLM generates it.
 *
 * (docs/06 sketches the artifact frame as `{"type":"artifact","type":"sticky",…}`, which is
 * not valid JSON — two `type` keys. The artifact is nested under `artifact` here instead.)
 */
export type AssistantStreamEvent =
  | { type: 'message'; role: 'assistant'; content: string }
  | { type: 'tool'; toolName: AssistantToolName; status: 'running'; args: Record<string, unknown> }
  | {
      type: 'tool-result';
      toolName: AssistantToolName;
      ok: boolean;
      /** Short human-readable outcome, e.g. "5 results" — full data rides in `artifact` frames. */
      summary: string;
      results?: WebSearchResult[];
    }
  | {
      type: 'artifact';
      /** Client-side handle so the Propose button knows which artifact it is sending. */
      artifactId: string;
      source: AssistantToolName;
      artifact: ArtifactJson;
    }
  | {
      type: 'error';
      /** A complete sentence on its own, for anything that shows a single line. */
      message: string;
      /** Stable identifier — see `ASSISTANT_ERRORS` for what each one means. */
      code?: string;
      /**
       * What the provider or the server actually said, verbatim and trimmed. Kept out of
       * `message` because it is often machine-shaped, but worth having one click away.
       */
      detail?: string;
    }
  | {
      /** The model started a reasoning block. Not a token of the visible reply. */
      type: 'status';
      phase: 'thinking';
    }
  | {
      type: 'done';
      reason: 'complete' | 'error' | 'max-steps' | 'aborted';
      /** Present once the provider reported usage — absent when it reported none. */
      usage?: AssistantUsage;
    };

/**
 * Every stream ends with exactly one `done`, including on error (docs/06 acceptance
 * criteria). Errors arrive as an `error` frame immediately before it.
 */
export const ASSISTANT_STREAM_TERMINATOR = 'done' satisfies AssistantStreamEvent['type'];

// ---------------------------------------------------------------------------
// Error codes
// ---------------------------------------------------------------------------

/**
 * Every code an assistant error can carry, and what to tell the person who hit it.
 *
 * The code is the stable part: safe to search logs and the codebase for, and to quote in a
 * bug report. The words can change. `title` says what went wrong; `hint` says what to do
 * next, written for someone in the middle of a session rather than for us.
 *
 * Codes come from three places: what the provider said (`LLM_*`), RoundTable's own checks
 * before a turn starts, and the browser's side of the connection (the last group).
 */
export const ASSISTANT_ERRORS = {
  // Setting up a provider
  LLM_NOT_CONFIGURED: {
    title: 'No AI provider is set up yet',
    hint: 'Add one in the assistant or on the Settings page, then send your message again.',
  },
  LLM_KEY_UNDECRYPTABLE: {
    title: 'Your saved API key can no longer be read',
    hint: 'The server has changed how it stores keys. Enter your key again in the provider settings.',
  },
  LLM_ENCRYPTION_UNCONFIGURED: {
    title: 'This server cannot store API keys yet',
    hint: 'LLM_KEY_ENCRYPTION_SECRET is not set on the server. Ask whoever runs it to set one.',
  },
  LLM_URL_INVALID: {
    title: 'That base URL is not valid',
    hint: 'Use the full address, for example https://api.groq.com/openai/v1.',
  },
  LLM_URL_PRIVATE_HOST: {
    title: 'That provider address is not allowed',
    hint: 'This server only calls public addresses, so a model on your own computer (such as Ollama) works only when RoundTable runs there too.',
  },
  LLM_URL_UNRESOLVABLE: {
    title: 'That provider address does not exist',
    hint: 'Check the base URL in your provider settings for a typo.',
  },

  // What the provider said
  LLM_AUTH_FAILED: {
    title: 'The provider rejected your API key',
    hint: 'It may have been revoked, or belong to a different provider. Enter it again in the provider settings.',
  },
  LLM_MODEL_NOT_FOUND: {
    title: 'The provider does not have that model',
    hint: 'Check the model name in your provider settings (providers retire models), and that the base URL ends at /v1.',
  },
  LLM_QUOTA_EXCEEDED: {
    title: 'Your provider account is out of credit',
    hint: "Check billing on the provider's website, or switch to a model on a free tier.",
  },
  LLM_RATE_LIMITED: {
    title: 'The provider is limiting how fast you can ask',
    hint: 'Wait a few seconds, then send it again. Free tiers allow only a few requests a minute.',
  },
  LLM_CONTEXT_TOO_LONG: {
    title: 'This chat is too long for the model',
    hint: 'Press Clear to start a fresh chat, or choose a model with a larger context window.',
  },
  LLM_TOOLS_UNSUPPORTED: {
    title: 'This model cannot use tools',
    hint: 'Sticky notes, diagrams, web search and session look-ups all need tool calling. Choose a model that supports it.',
  },
  LLM_REQUEST_REJECTED: {
    title: 'The provider refused the request',
    hint: 'RoundTable sent something this provider or model does not accept; it was not something you typed. Try again, or choose a different model.',
  },
  LLM_PROVIDER_ERROR: {
    title: 'The provider had a problem on its side',
    hint: 'Nothing is wrong with your setup. Try again in a moment.',
  },
  LLM_HTTP_ERROR: {
    title: 'The provider answered with an unexpected error',
    hint: 'Try again. If it keeps happening, compare the details below with your provider settings.',
  },
  LLM_TIMEOUT: {
    title: 'The provider took too long to answer',
    hint: 'Try again, or ask something shorter. A local model can take a while to load.',
  },
  LLM_UNREACHABLE: {
    title: 'Could not reach the provider',
    hint: 'Check the base URL in your provider settings, and that the provider is up.',
  },
  LLM_FAILED: {
    title: 'The model call failed',
    hint: 'Try again. The details below say what went wrong.',
  },

  // RoundTable's own checks before a turn starts
  UNAUTHENTICATED: {
    title: 'You are signed out',
    hint: 'Log in again, then send your message again.',
  },
  NOT_SESSION_MEMBER: {
    title: 'You are not in this session',
    hint: 'Rejoin it with the session code, then try again.',
  },
  ASSISTANT_RATE_LIMITED: {
    title: 'Too many messages in a short time',
    hint: 'Wait a moment, then send it again.',
  },
  VALIDATION_FAILED: {
    title: 'That message could not be sent',
    hint: 'Try a shorter message, or press Clear and ask again.',
  },
  INTERNAL: {
    title: 'RoundTable hit an unexpected error',
    hint: 'Try again. If it keeps happening, report the code below.',
  },

  // The browser's side of the connection
  NETWORK_ERROR: {
    title: 'Could not reach RoundTable',
    hint: 'Check your connection, and that the server is running.',
  },
  STREAM_INTERRUPTED: {
    title: 'The connection dropped mid-answer',
    hint: 'Whatever arrived is above. Ask again for the rest.',
  },
  STREAM_EMPTY: {
    title: 'The server sent back nothing',
    hint: 'Try again.',
  },
  REQUEST_FAILED: {
    title: 'The request failed',
    hint: 'Try again. The details below have the status the server returned.',
  },
} as const satisfies Record<string, { title: string; hint: string }>;

export type AssistantErrorCode = keyof typeof ASSISTANT_ERRORS;

export function isAssistantErrorCode(code: unknown): code is AssistantErrorCode {
  return typeof code === 'string' && Object.prototype.hasOwnProperty.call(ASSISTANT_ERRORS, code);
}

/** Title and hint as one line, for places that show a single string. */
export function assistantErrorMessage(code: AssistantErrorCode): string {
  const { title, hint } = ASSISTANT_ERRORS[code];
  return `${title}. ${hint}`;
}

/** Guard for narrowing a parsed SSE payload without trusting `as`. */
export function isAssistantStreamEvent(value: unknown): value is AssistantStreamEvent {
  if (typeof value !== 'object' || value === null) return false;
  const type = (value as { type?: unknown }).type;
  if (type === 'status') return (value as { phase?: unknown }).phase === 'thinking';
  return (
    type === 'message' ||
    type === 'tool' ||
    type === 'tool-result' ||
    type === 'artifact' ||
    type === 'error' ||
    type === 'done'
  );
}

/** Validates an artifact frame's payload before the UI renders or proposes it. */
export const assistantArtifactFrameSchema = z.object({
  type: z.literal('artifact'),
  artifactId: z.string().min(1).max(64),
  source: z.enum(ASSISTANT_TOOL_NAMES),
  artifact: artifactWriteJsonSchema,
});
