// AI Assistant contracts (F33–F37) — shared by the SSE endpoint and the chat panel.
//
// Owner: AI Assistant module (docs/06). The assistant is per-user and private: nothing
// here is broadcast to a session room (docs/02 §8.8).
import { z } from 'zod';

import { proposalArtifactSchema, type ProposalArtifact } from './artifacts.js';

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
// F35 — session context sent with each chat turn
// ---------------------------------------------------------------------------

export const assistantContextProposalSchema = z.object({
  id: z.string().max(64),
  type: z.string().max(24),
  authorName: z.string().max(80).optional(),
  summary: z.string().max(300),
});

/**
 * Context the client already has on screen. The server merges this with whatever it can
 * read server-side (session row today; questions/proposals once those modules land) —
 * the client is a convenience, never the authority.
 */
export const assistantContextSchema = z.object({
  sessionTitle: z.string().max(200).optional(),
  activeQuestion: z.string().max(500).optional(),
  /** Needed by "Propose" (F37): a proposal belongs to a question, not to the session. */
  activeQuestionId: z.string().max(64).optional(),
  phase: z.string().max(40).optional(),
  selectedProposalId: z.string().max(64).optional(),
  recentProposalIds: z.array(z.string().max(64)).max(50).optional(),
  recentProposals: z.array(assistantContextProposalSchema).max(20).optional(),
});
export type AssistantContext = z.infer<typeof assistantContextSchema>;

export const assistantHistoryMessageSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string().max(8000),
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
// F36 — agent tools
// ---------------------------------------------------------------------------

export const ASSISTANT_TOOL_NAMES = ['web_search', 'create_diagram', 'sticky_ideation'] as const;
export type AssistantToolName = (typeof ASSISTANT_TOOL_NAMES)[number];

export interface WebSearchResult {
  title: string;
  url: string;
  snippet: string;
}

// ---------------------------------------------------------------------------
// SSE stream events (assistant owner's "Also owns" item 1, docs/06)
// ---------------------------------------------------------------------------

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
      artifact: ProposalArtifact;
    }
  | { type: 'error'; message: string; code?: string }
  | { type: 'done'; reason: 'complete' | 'error' | 'max-steps' | 'aborted' };

/**
 * Every stream ends with exactly one `done`, including on error (docs/06 acceptance
 * criteria). Errors arrive as an `error` frame immediately before it.
 */
export const ASSISTANT_STREAM_TERMINATOR = 'done' satisfies AssistantStreamEvent['type'];

/** Guard for narrowing a parsed SSE payload without trusting `as`. */
export function isAssistantStreamEvent(value: unknown): value is AssistantStreamEvent {
  if (typeof value !== 'object' || value === null) return false;
  const type = (value as { type?: unknown }).type;
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
  artifact: proposalArtifactSchema,
});
