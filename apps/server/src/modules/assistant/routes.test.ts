// End-to-end over real HTTP: Express router → SSE writer → client.
//
// Only the two edges of the system are faked — the database and the LLM provider. Everything
// between them is the code that ships, which is what makes this the test that proves the
// docs/06 acceptance criteria ("reply appears incrementally", "stream always ends with done,
// even on error", "keys never come back out").
import express from 'express';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type { LlmStreamChunk } from './llm.js';

vi.stubEnv('NODE_ENV', 'development');
vi.stubEnv('DEV_USER_ID', 'demo-user-alice');
vi.stubEnv('LLM_KEY_ENCRYPTION_SECRET', 'test-encryption-secret-value-32ch');

// --- fake database ---------------------------------------------------------
interface ConfigRow {
  id: string;
  userId: string;
  baseUrl: string;
  model: string;
  apiKeyEncrypted: string;
}
const configs = new Map<string, ConfigRow>();
const sessions = new Map<string, { id: string; title: string; status: string }>();

vi.mock('../../db.js', () => ({
  prisma: {
    userLLMConfig: {
      findUnique: async ({ where }: { where: { userId: string } }) =>
        configs.get(where.userId) ?? null,
      upsert: async ({
        where,
        create,
        update,
      }: {
        where: { userId: string };
        create: Omit<ConfigRow, 'id'>;
        update: Partial<ConfigRow>;
      }) => {
        const existing = configs.get(where.userId);
        const row = existing ? { ...existing, ...update } : { id: 'cfg_1', ...create };
        configs.set(where.userId, row as ConfigRow);
        return row;
      },
      deleteMany: async ({ where }: { where: { userId: string } }) => {
        const had = configs.delete(where.userId);
        return { count: had ? 1 : 0 };
      },
    },
    session: {
      findUnique: async ({ where }: { where: { id: string } }) => sessions.get(where.id) ?? null,
    },
  },
}));

// --- fake LLM provider -----------------------------------------------------
const script: LlmStreamChunk[][] = [];
vi.mock('./llm.js', () => ({
  streamChatCompletion: () => {
    const turn = script.shift() ?? [{ type: 'finish', toolCalls: [], finishReason: 'stop' }];
    return (async function* () {
      for (const chunk of turn) yield chunk;
    })();
  },
  probeChatCompletion: async () => ({ latencyMs: 12, model: 'test-model' }),
}));

const { assistantRouter } = await import('./routes.js');
const { errorHandler } = await import('../../middleware/error.js');

let server: http.Server;
let base: string;

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use('/api', assistantRouter);
  // Mirrors src/index.ts: without this, Express's default handler answers with HTML and
  // the client's `{ error, code }` contract quietly disappears.
  app.use(errorHandler);
  server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => {
  server.close();
});

beforeEach(() => {
  configs.clear();
  sessions.clear();
  sessions.set('s1', { id: 's1', title: 'Pick a database', status: 'active' });
  script.length = 0;
});

const CONFIG = {
  baseUrl: 'https://api.example.test/v1',
  apiKey: 'sk-super-secret-value',
  model: 'test-model',
};

async function readStream(response: Response): Promise<Array<Record<string, unknown>>> {
  const text = await response.text();
  return text
    .split('\n\n')
    .map((frame) =>
      frame
        .split('\n')
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice(5).trim())
        .join('\n'),
    )
    .filter(Boolean)
    .map((payload) => JSON.parse(payload) as Record<string, unknown>);
}

function chat(body: unknown, sessionId = 's1') {
  return fetch(`${base}/api/sessions/${sessionId}/assistant/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('llm-config endpoints (F33)', () => {
  it('reports no config for a fresh user', async () => {
    const response = await fetch(`${base}/api/me/llm-config`);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ config: null });
  });

  it('saves a config and never returns the key again', async () => {
    const save = await fetch(`${base}/api/me/llm-config`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(CONFIG),
    });
    expect(save.status).toBe(200);

    const read = await fetch(`${base}/api/me/llm-config`);
    const body = (await read.json()) as { config: Record<string, unknown> };
    expect(body.config).toEqual({ baseUrl: CONFIG.baseUrl, model: CONFIG.model, hasKey: true });
    expect(JSON.stringify(body)).not.toContain(CONFIG.apiKey);
  });

  it('stores the key encrypted, not in plain text', async () => {
    await fetch(`${base}/api/me/llm-config`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(CONFIG),
    });
    const stored = configs.get('demo-user-alice');
    expect(stored?.apiKeyEncrypted).toBeDefined();
    expect(stored?.apiKeyEncrypted).not.toContain(CONFIG.apiKey);
    expect(stored?.apiKeyEncrypted.startsWith('v1.')).toBe(true);
  });

  it('rejects an invalid base URL with 400 and a reason', async () => {
    const response = await fetch(`${base}/api/me/llm-config`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...CONFIG, baseUrl: 'not-a-url' }),
    });
    expect(response.status).toBe(400);
    expect((await response.json()).error).toMatch(/baseUrl/);
  });

  it('tests a connection without saving anything', async () => {
    const response = await fetch(`${base}/api/me/llm-config/test`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(CONFIG),
    });
    expect(await response.json()).toMatchObject({ ok: true, model: 'test-model' });
    expect(configs.size).toBe(0);
  });

  it('deletes the config', async () => {
    await fetch(`${base}/api/me/llm-config`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(CONFIG),
    });
    await fetch(`${base}/api/me/llm-config`, { method: 'DELETE' });
    expect(configs.size).toBe(0);
  });

  // Providers retire model ids (Groq dropped llama-3.3-70b-versatile on 2026-08-16), so
  // editing only the model is routine — and the browser cannot resend a key it never saw.
  it('keeps the stored key when a save omits it', async () => {
    await fetch(`${base}/api/me/llm-config`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(CONFIG),
    });
    const originalCiphertext = configs.get('demo-user-alice')?.apiKeyEncrypted;

    const response = await fetch(`${base}/api/me/llm-config`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ baseUrl: CONFIG.baseUrl, model: 'a-different-model' }),
    });

    expect(response.status).toBe(200);
    const stored = configs.get('demo-user-alice');
    expect(stored?.model).toBe('a-different-model');
    expect(stored?.apiKeyEncrypted).toBe(originalCiphertext);
    expect((await response.json()).config).toMatchObject({ hasKey: true });
  });

  it('refuses a first save with no key', async () => {
    const response = await fetch(`${base}/api/me/llm-config`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ baseUrl: CONFIG.baseUrl, model: CONFIG.model }),
    });
    expect(response.status).toBe(400);
    expect((await response.json()).code).toBe('LLM_KEY_REQUIRED');
    expect(configs.size).toBe(0);
  });

  it('tests a new model against the stored key', async () => {
    await fetch(`${base}/api/me/llm-config`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(CONFIG),
    });
    const response = await fetch(`${base}/api/me/llm-config/test`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ baseUrl: CONFIG.baseUrl, model: 'some-new-model' }),
    });
    expect(await response.json()).toMatchObject({ ok: true });
  });
});

describe('chat stream (F35/F36)', () => {
  beforeEach(async () => {
    await fetch(`${base}/api/me/llm-config`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(CONFIG),
    });
  });

  it('streams incremental message frames then done', async () => {
    script.push([
      { type: 'content', text: 'Postgres ' },
      { type: 'content', text: 'fits the voting model.' },
      { type: 'finish', toolCalls: [], finishReason: 'stop' },
    ]);

    const response = await chat({ message: 'Which database?' });
    expect(response.headers.get('content-type')).toContain('text/event-stream');

    const frames = await readStream(response);
    expect(frames.map((f) => f.type)).toEqual(['message', 'message', 'done']);
    expect(frames.map((f) => f.content).join('')).toBe('Postgres fits the voting model.');
    expect(frames.at(-1)).toEqual({ type: 'done', reason: 'complete' });
  });

  it('streams tool and artifact frames in order', async () => {
    script.push([
      {
        type: 'finish',
        finishReason: 'tool_calls',
        toolCalls: [
          {
            id: 'c1',
            name: 'sticky_ideation',
            arguments: JSON.stringify({ ideas: [{ text: 'Neon' }, { text: 'Supabase' }] }),
          },
        ],
      },
    ]);
    script.push([
      { type: 'content', text: 'Two to compare.' },
      { type: 'finish', toolCalls: [], finishReason: 'stop' },
    ]);

    const frames = await readStream(await chat({ message: 'Ideas please' }));
    expect(frames.map((f) => f.type)).toEqual([
      'tool',
      'artifact',
      'artifact',
      'tool-result',
      'message',
      'done',
    ]);
    expect(frames[1]).toMatchObject({ source: 'sticky_ideation', artifact: { type: 'sticky' } });
    expect(frames[1]?.artifactId).toEqual(expect.any(String));
  });

  it('ends with done even when the turn fails', async () => {
    configs.clear(); // no provider configured
    const frames = await readStream(await chat({ message: 'hi' }));
    expect(frames.map((f) => f.type)).toEqual(['error', 'done']);
    expect(frames[0]?.code).toBe('LLM_NOT_CONFIGURED');
    expect(frames.at(-1)).toEqual({ type: 'done', reason: 'error' });
  });

  it('rejects an empty message as a plain 400, before the stream opens', async () => {
    const response = await chat({ message: '' });
    expect(response.status).toBe(400);
    expect(response.headers.get('content-type')).toContain('application/json');
  });

  it('accepts client-supplied session context', async () => {
    script.push([
      { type: 'content', text: 'ok' },
      { type: 'finish', toolCalls: [], finishReason: 'stop' },
    ]);
    const response = await chat({
      message: 'What are we deciding?',
      context: {
        activeQuestion: 'Which database?',
        activeQuestionId: 'q1',
        phase: 'discussion',
        recentProposals: [{ id: 'p1', type: 'sticky', summary: 'Use Neon', authorName: 'Bob' }],
      },
      history: [{ role: 'user', content: 'earlier turn' }],
    });
    expect(response.status).toBe(200);
    expect((await readStream(response)).at(-1)).toEqual({ type: 'done', reason: 'complete' });
  });
});
