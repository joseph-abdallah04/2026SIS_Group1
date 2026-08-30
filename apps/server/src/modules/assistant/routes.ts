// HTTP surface for the assistant module (docs/02 §5).
//
//   GET    /api/me/llm-config        → { baseUrl, model, hasKey } — never the key itself
//   PUT    /api/me/llm-config        → save provider config
//   DELETE /api/me/llm-config        → forget it
//   POST   /api/me/llm-config/test   → "Test connection"
//   POST   /api/sessions/:id/assistant/chat → SSE stream of the assistant's turn
import { Router } from 'express';
import type { Response } from 'express';
import {
  assistantChatRequestSchema,
  llmConfigUpsertSchema,
  type AssistantStreamEvent,
} from '@roundtable/shared';

import { SseWriter } from '../../lib/sse.js';
import { getUserId, requireAuth } from '../../middleware/auth.js';
import { ApiError } from '../../middleware/error.js';
import { runAssistantTurn } from './agent.js';
import { buildSessionContext } from './context.js';
import {
  deleteLlmConfig,
  getLlmConfigPublic,
  getLlmCredentials,
  saveLlmConfig,
  testLlmConfig,
} from './llmConfig.service.js';
import { buildSystemPrompt } from './prompt.js';

export const assistantRouter: Router = Router();

// ---------------------------------------------------------------------------
// F33 — LLM provider configuration
// ---------------------------------------------------------------------------

assistantRouter.get('/me/llm-config', requireAuth, async (req, res, next) => {
  try {
    res.json({ config: await getLlmConfigPublic(getUserId(req)) });
  } catch (cause) {
    next(cause);
  }
});

assistantRouter.put('/me/llm-config', requireAuth, async (req, res, next) => {
  try {
    const parsed = llmConfigUpsertSchema.safeParse(req.body);
    if (!parsed.success) throw validationError(parsed.error.issues);
    res.json({ config: await saveLlmConfig(getUserId(req), parsed.data) });
  } catch (cause) {
    next(cause);
  }
});

assistantRouter.delete('/me/llm-config', requireAuth, async (req, res, next) => {
  try {
    await deleteLlmConfig(getUserId(req));
    res.json({ ok: true });
  } catch (cause) {
    next(cause);
  }
});

assistantRouter.post('/me/llm-config/test', requireAuth, async (req, res, next) => {
  try {
    // An empty body tests what is already saved. A body tests what the user just typed, so
    // they can verify before committing a key — and if it omits the key, the stored one is
    // used, which is how "same key, different model" gets tested.
    const hasBody = req.body && Object.keys(req.body as object).length > 0;
    if (!hasBody) {
      res.json(await testLlmConfig(getUserId(req)));
      return;
    }
    const parsed = llmConfigUpsertSchema.safeParse(req.body);
    if (!parsed.success) throw validationError(parsed.error.issues);
    res.json(await testLlmConfig(getUserId(req), parsed.data));
  } catch (cause) {
    next(cause);
  }
});

// ---------------------------------------------------------------------------
// F35–F36 — the chat stream
// ---------------------------------------------------------------------------

assistantRouter.post('/sessions/:id/assistant/chat', requireAuth, async (req, res, next) => {
  // Express types route params as `string | string[]`; a single `:id` is always a string.
  const rawId = req.params.id;
  const sessionId = Array.isArray(rawId) ? rawId[0] : rawId;
  if (!sessionId) {
    next(new ApiError(400, 'Session id is required', 'SESSION_ID_REQUIRED'));
    return;
  }

  let userId: string;
  let request: ReturnType<typeof assistantChatRequestSchema.parse>;
  try {
    userId = getUserId(req);
    const parsed = assistantChatRequestSchema.safeParse(req.body);
    if (!parsed.success) throw validationError(parsed.error.issues);
    request = parsed.data;
  } catch (cause) {
    // Nothing has been streamed yet, so this can still be a normal JSON error response.
    next(cause);
    return;
  }

  await streamAssistantTurn(res, { sessionId, userId, request });
});

async function streamAssistantTurn(
  res: Response,
  input: {
    sessionId: string;
    userId: string;
    request: ReturnType<typeof assistantChatRequestSchema.parse>;
  },
): Promise<void> {
  const stream = new SseWriter<AssistantStreamEvent>(res);

  // Abort the LLM call and any in-flight tool the moment the user closes the panel —
  // they are paying for those tokens.
  //
  // Listen on the *response*, not the request: `req` emits 'close' as soon as its body has
  // been read, which for a POST is immediately, and would abort every turn at step zero.
  const abort = new AbortController();
  res.on('close', () => abort.abort());

  try {
    // Credentials are fetched first: "no provider configured" is the single most common
    // failure and deserves a clean error frame rather than a half-started stream.
    const credentials = await getLlmCredentials(input.userId);
    const context = await buildSessionContext(input.sessionId, input.userId, input.request.context);

    const reason = await runAssistantTurn({
      credentials,
      systemPrompt: buildSystemPrompt(context),
      history: input.request.history,
      message: input.request.message,
      emit: (event) => stream.send(event),
      signal: abort.signal,
    });

    stream.send({ type: 'done', reason });
  } catch (cause) {
    if (abort.signal.aborted) {
      stream.send({ type: 'done', reason: 'aborted' });
    } else {
      const apiError = cause instanceof ApiError ? cause : null;
      if (!apiError) console.error('assistant: chat turn failed', cause);
      stream.send({
        type: 'error',
        message: apiError?.message ?? 'The assistant hit an unexpected error.',
        ...(apiError?.code ? { code: apiError.code } : {}),
      });
      // Every stream terminates with `done`, including on error (docs/06 acceptance criteria).
      stream.send({ type: 'done', reason: 'error' });
    }
  } finally {
    stream.close();
  }
}

function validationError(issues: Array<{ path: PropertyKey[]; message: string }>): ApiError {
  const detail = issues
    .map((issue) => `${issue.path.map(String).join('.') || 'body'}: ${issue.message}`)
    .join('; ');
  return new ApiError(400, `Invalid request: ${detail}`, 'VALIDATION_FAILED');
}
