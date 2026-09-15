// End-to-end over real HTTP: Express router → agent → SSE writer → client.
//
// Only the true edges are faked — the database, the session membership check, and the
// model itself. Everything between them is the code that ships, which is what makes this
// the test that proves the docs/06 acceptance criteria ("reply appears incrementally",
// "stream always ends with done, even on error", "keys never come back out").
import express from 'express';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { scriptedModel, type ScriptedTurn } from './testing/scriptedModel.js';

vi.stubEnv('NODE_ENV', 'development');
vi.stubEnv('JWT_SECRET', 'test-jwt-secret-at-least-32-characters-long');
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
const usageRows: Array<Record<string, unknown>> = [];

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
    assistantTurnUsage: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        usageRows.push(data);
        return data;
      },
      groupBy: async () => [],
    },
  },
}));

// --- membership, as a controllable edge ------------------------------------
const assertSessionMember = vi.fn();
// The agenda goes into every prompt, so the two reads behind it are controllable here too.
const getSessionWithQuestions = vi.fn();
const getActiveQuestion = vi.fn();
vi.mock('../sessions/index.js', () => ({
  assertSessionMember: (...args: unknown[]) => assertSessionMember(...args),
  getSessionWithQuestions: (...args: unknown[]) => getSessionWithQuestions(...args),
  getActiveQuestion: (...args: unknown[]) => getActiveQuestion(...args),
}));

// --- the board the assistant reads its context from ------------------------
const getBoardForSession = vi.fn();
const listProposals = vi.fn();
vi.mock('../pinboard/index.js', () => ({
  getBoardForSession: (...args: unknown[]) => getBoardForSession(...args),
  listProposals: (...args: unknown[]) => listProposals(...args),
}));

// Reached only by `look_up_session`, but mocked all the same: importing the real voting
// module here would drag its sockets and deadline timers into a route test.
const getSessionVoteOutcomes = vi.fn();
vi.mock('../voting/index.js', () => ({
  getSessionVoteOutcomes: (...args: unknown[]) => getSessionVoteOutcomes(...args),
}));

// --- the model -------------------------------------------------------------
// `createAssistantModel` is replaced; everything else in provider.js (the SSRF check, the
// error translation) stays real.
const script: ScriptedTurn[][] = [];
let lastModel: ReturnType<typeof scriptedModel> | undefined;

vi.mock('./provider.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./provider.js')>();
  return {
    ...actual,
    createAssistantModel: () => {
      lastModel = scriptedModel(script.shift() ?? [{ text: 'ok' }]);
      return lastModel;
    },
    probeCredentials: async () => ({ latencyMs: 12, model: 'test-model' }),
  };
});

const { assistantRouter } = await import('./routes.js');
const { errorHandler, ApiError } = await import('../../middleware/error.js');
const { signToken } = await import('../auth/jwt.js');

// A real token from the real signer: every request below is authenticated the way a browser
// authenticates, so `requireAuth` is exercised rather than bypassed.
const USER_ID = 'demo-user-alice';
const TOKEN = signToken({ userId: USER_ID });

/** Request headers with the bearer token attached. */
function authed(extra?: Record<string, string>): Record<string, string> {
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}`, ...extra };
}

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
  assertSessionMember.mockReset();
  assertSessionMember.mockResolvedValue(undefined);
  getBoardForSession.mockReset();
  getBoardForSession.mockResolvedValue(emptyBoard());
  getSessionWithQuestions.mockReset();
  getSessionWithQuestions.mockResolvedValue(sessionWithQuestions());
  getActiveQuestion.mockReset();
  getActiveQuestion.mockResolvedValue({ id: 'q1' });
  listProposals.mockReset();
  listProposals.mockResolvedValue([]);
  getSessionVoteOutcomes.mockReset();
  getSessionVoteOutcomes.mockResolvedValue([]);
  configs.clear();
  usageRows.length = 0;
  script.length = 0;
  lastModel = undefined;
});

/** A three-question agenda with the board's question, `q1`, in the middle of it. */
function sessionWithQuestions(overrides: Record<string, unknown> = {}) {
  return {
    id: 's1',
    title: 'Pick a database',
    questions: [
      { id: 'q0', text: 'What slowed us down?', position: 0, status: 'answered' },
      { id: 'q1', text: 'Which database?', position: 1, status: 'discussion' },
      { id: 'q2', text: 'Who owns the migration?', position: 2, status: 'pending' },
    ],
    ...overrides,
  };
}

function emptyBoard(overrides: Record<string, unknown> = {}) {
  return {
    sessionId: 's1',
    sessionTitle: 'Pick a database',
    leaderId: 'demo-user-bob',
    questionId: 'q1',
    questionText: 'Which database?',
    questionPosition: 1,
    questionStatus: 'discussion',
    items: [],
    discussionTimer: null,
    ...overrides,
  };
}

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
    headers: authed(),
    body: JSON.stringify(body),
  });
}

describe('llm-config endpoints (F33)', () => {
  it('reports no config for a fresh user', async () => {
    const response = await fetch(`${base}/api/me/llm-config`, { headers: authed() });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ config: null });
  });

  it('saves a config and never returns the key again', async () => {
    const save = await fetch(`${base}/api/me/llm-config`, {
      method: 'PUT',
      headers: authed(),
      body: JSON.stringify(CONFIG),
    });
    expect(save.status).toBe(200);

    const read = await fetch(`${base}/api/me/llm-config`, { headers: authed() });
    const body = (await read.json()) as { config: Record<string, unknown> };
    expect(body.config).toEqual({ baseUrl: CONFIG.baseUrl, model: CONFIG.model, hasKey: true });
    expect(JSON.stringify(body)).not.toContain(CONFIG.apiKey);
  });

  it('stores the key encrypted, not in plain text', async () => {
    await fetch(`${base}/api/me/llm-config`, {
      method: 'PUT',
      headers: authed(),
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
      headers: authed(),
      body: JSON.stringify({ ...CONFIG, baseUrl: 'not-a-url' }),
    });
    expect(response.status).toBe(400);
    expect((await response.json()).error).toMatch(/baseUrl/);
  });

  // The API key belongs in the key field, where it is encrypted. In the URL it would be
  // stored in clear text and repeated into every log line that records the base URL.
  it('rejects a base URL with credentials embedded in it', async () => {
    const response = await fetch(`${base}/api/me/llm-config`, {
      method: 'PUT',
      headers: authed(),
      body: JSON.stringify({ ...CONFIG, baseUrl: 'https://user:secret@api.example.test/v1' }),
    });
    expect(response.status).toBe(400);
    expect((await response.json()).code).toBe('LLM_URL_INVALID');
    expect(configs.size).toBe(0);
  });

  it('rejects a non-http base URL', async () => {
    const response = await fetch(`${base}/api/me/llm-config`, {
      method: 'PUT',
      headers: authed(),
      body: JSON.stringify({ ...CONFIG, baseUrl: 'file:///etc/passwd' }),
    });
    expect(response.status).toBe(400);
    expect(configs.size).toBe(0);
  });

  it('tests a connection without saving anything', async () => {
    const response = await fetch(`${base}/api/me/llm-config/test`, {
      method: 'POST',
      headers: authed(),
      body: JSON.stringify(CONFIG),
    });
    expect(await response.json()).toMatchObject({ ok: true, model: 'test-model' });
    expect(configs.size).toBe(0);
  });

  it('deletes the config', async () => {
    await fetch(`${base}/api/me/llm-config`, {
      method: 'PUT',
      headers: authed(),
      body: JSON.stringify(CONFIG),
    });
    await fetch(`${base}/api/me/llm-config`, { method: 'DELETE', headers: authed() });
    expect(configs.size).toBe(0);
  });

  // Providers retire model ids (Groq dropped llama-3.3-70b-versatile on 2026-08-16), so
  // editing only the model is routine — and the browser cannot resend a key it never saw.
  it('keeps the stored key when a save omits it', async () => {
    await fetch(`${base}/api/me/llm-config`, {
      method: 'PUT',
      headers: authed(),
      body: JSON.stringify(CONFIG),
    });
    const originalCiphertext = configs.get('demo-user-alice')?.apiKeyEncrypted;

    const response = await fetch(`${base}/api/me/llm-config`, {
      method: 'PUT',
      headers: authed(),
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
      headers: authed(),
      body: JSON.stringify({ baseUrl: CONFIG.baseUrl, model: CONFIG.model }),
    });
    expect(response.status).toBe(400);
    expect((await response.json()).code).toBe('LLM_KEY_REQUIRED');
    expect(configs.size).toBe(0);
  });

  it('tests a new model against the stored key', async () => {
    await fetch(`${base}/api/me/llm-config`, {
      method: 'PUT',
      headers: authed(),
      body: JSON.stringify(CONFIG),
    });
    const response = await fetch(`${base}/api/me/llm-config/test`, {
      method: 'POST',
      headers: authed(),
      body: JSON.stringify({ baseUrl: CONFIG.baseUrl, model: 'some-new-model' }),
    });
    expect(await response.json()).toMatchObject({ ok: true });
  });
});

describe('chat stream (F35/F36)', () => {
  // The assistant reads the live board into its prompt, so this is the gate that stops a
  // logged-in stranger reading a board they never joined by guessing a session id.
  it('refuses a caller who is not a member of the session', async () => {
    assertSessionMember.mockRejectedValue(
      new ApiError(403, 'You are not a member of this session', 'NOT_SESSION_MEMBER'),
    );

    const response = await chat({ message: 'What have we proposed?' });

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ code: 'NOT_SESSION_MEMBER' });
    // A plain JSON refusal, not an SSE stream that opens and then apologises.
    expect(response.headers.get('content-type')).toMatch(/application\/json/);
  });

  it('checks membership against the session in the URL, for the caller', async () => {
    await chat({ message: 'hello' }, 's1');
    expect(assertSessionMember).toHaveBeenCalledWith('s1', USER_ID);
  });

  it('never reaches the provider when membership fails', async () => {
    assertSessionMember.mockRejectedValue(
      new ApiError(403, 'You are not a member of this session', 'NOT_SESSION_MEMBER'),
    );
    script.push([{ text: 'should never be sent' }]);

    await chat({ message: 'hello' });

    // The scripted turn is still queued: nothing consumed it.
    expect(script).toHaveLength(1);
  });

  beforeEach(async () => {
    await fetch(`${base}/api/me/llm-config`, {
      method: 'PUT',
      headers: authed(),
      body: JSON.stringify(CONFIG),
    });
  });

  it('streams incremental message frames then done', async () => {
    script.push([{ text: ['Postgres ', 'fits the voting model.'] }]);

    const response = await chat({ message: 'Which database?' });
    expect(response.headers.get('content-type')).toContain('text/event-stream');

    const frames = await readStream(response);
    expect(frames.map((f) => f.type)).toEqual(['message', 'message', 'done']);
    expect(frames.map((f) => f.content).join('')).toBe('Postgres fits the voting model.');
    expect(frames.at(-1)).toMatchObject({ type: 'done', reason: 'complete' });
  });

  it('streams tool and artifact frames in order', async () => {
    script.push([
      {
        toolCalls: [
          { name: 'sticky_ideation', input: { ideas: [{ text: 'Neon' }, { text: 'Supabase' }] } },
        ],
      },
      { text: 'Two to compare.' },
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
    expect(frames.at(-1)).toMatchObject({ type: 'done', reason: 'error' });
  });

  it('rejects an empty message as a plain 400, before the stream opens', async () => {
    const response = await chat({ message: '' });
    expect(response.status).toBe(400);
    expect(response.headers.get('content-type')).toContain('application/json');
  });
});

describe('prompt context is server-authoritative (F35)', () => {
  beforeEach(async () => {
    await fetch(`${base}/api/me/llm-config`, {
      method: 'PUT',
      headers: authed(),
      body: JSON.stringify(CONFIG),
    });
  });

  /** The instructions the model was actually given. */
  function instructionsSent(): string {
    const prompt = lastModel?.doStreamCalls[0]?.prompt ?? [];
    const system = prompt.find((message) => message.role === 'system');
    return typeof system?.content === 'string' ? system.content : '';
  }

  it('describes the board it read, not the one the client described', async () => {
    getBoardForSession.mockResolvedValue(
      emptyBoard({
        questionText: 'Which database?',
        items: [
          {
            id: 'p1',
            questionId: 'q1',
            authorId: 'u2',
            authorName: 'Bob',
            type: 'sticky',
            artifactJson: { type: 'sticky', text: 'Use Neon', color: 'yellow' },
            x: 0,
            y: 0,
            createdAt: new Date().toISOString(),
            editedAt: null,
            extendsProposalId: null,
            reactions: [],
          },
        ],
      }),
    );

    await readStream(
      await chat({
        message: 'What are we deciding?',
        // Everything below is a lie the caller is entitled to send. None of it is a fact
        // about the session, so none of it may reach the model as one.
        context: {
          sessionTitle: 'Totally different session',
          activeQuestion: 'Should we fire Bob?',
          recentProposals: [
            { id: 'forged', type: 'sticky', summary: 'Bob agreed to resign', authorName: 'Bob' },
          ],
        },
      }),
    );

    const instructions = instructionsSent();
    expect(instructions).toContain('Which database?');
    // The board's contents are counted here, not listed — the notes themselves are a
    // `look_up_session` call away. The count still has to be the server's own.
    expect(instructions).toContain('1 proposal');
    expect(instructions).not.toContain('Should we fire Bob?');
    expect(instructions).not.toContain('Bob agreed to resign');
    expect(instructions).not.toContain('Totally different session');
  });

  // The assistant asked the user "which question do you want ideas for?" while the
  // question was sitting in its own prompt. The agenda is what makes "this question"
  // answerable without asking, so it has to be in every turn's instructions — not
  // something the model has to think to go and fetch.
  it('puts the agenda and the live question in the instructions, unasked', async () => {
    await readStream(await chat({ message: 'Give me 5 sticky notes for this question' }));

    const instructions = instructionsSent();
    expect(instructions).toContain('1. [answered] What slowed us down?');
    expect(instructions).toContain('2. [discussion] Which database? ← the team is on this one now');
    expect(instructions).toContain('3. [pending] Who owns the migration?');
    expect(instructions).toContain('The question being discussed right now: Which database?');
  });

  // A skipped question is not a question still to come. Passing the board's own word for
  // it through untranslated is what keeps the model from offering to "get back to" one.
  it('keeps a skipped question distinguishable from a pending one', async () => {
    getSessionWithQuestions.mockResolvedValue(
      sessionWithQuestions({
        questions: [
          { id: 'q0', text: 'What slowed us down?', position: 0, status: 'skipped' },
          { id: 'q1', text: 'Which database?', position: 1, status: 'discussion' },
        ],
      }),
    );

    await readStream(await chat({ message: 'Where are we up to?' }));

    expect(instructionsSent()).toContain('1. [skipped] What slowed us down?');
  });

  // The board's contents left the prompt when they grew too expensive to send every turn.
  // Nothing then tells the model they have changed, so the count has to.
  it('counts the board rather than listing it, and says so when it is empty', async () => {
    await readStream(await chat({ message: 'anything there?' }));
    expect(instructionsSent()).toContain('The pinboard for this question is empty');
  });

  it('tells the model the pinboard is empty so a prior turn cannot contradict it', async () => {
    getBoardForSession.mockResolvedValue(emptyBoard({ items: [] }));

    await readStream(
      await chat({
        message: 'Check again',
        history: [
          { role: 'user', content: 'What is on the board?' },
          { role: 'assistant', content: 'Three sticky notes.' },
        ],
      }),
    );

    const instructions = instructionsSent();
    expect(instructions).toMatch(/pinboard is empty/i);
    expect(instructions).toMatch(/authoritative live board/i);
  });

  // The board and the agenda are read separately, so losing one is not losing both: a
  // failed board read costs the proposal count and keeps the agenda, which is the half
  // that tells the assistant what the user is talking about.
  it('still answers, and still knows the agenda, when the board cannot be read', async () => {
    getBoardForSession.mockRejectedValue(new Error('database is down'));
    script.push([{ text: 'I can still help.' }]);

    const frames = await readStream(await chat({ message: 'hello' }));
    expect(frames.at(-1)).toMatchObject({ type: 'done', reason: 'complete' });
    expect(instructionsSent()).toContain('2. [discussion] Which database?');
  });

  it('falls back to admitting it knows nothing only when nothing at all can be read', async () => {
    getBoardForSession.mockRejectedValue(new Error('database is down'));
    getSessionWithQuestions.mockRejectedValue(new Error('database is down'));
    script.push([{ text: 'I can still help.' }]);

    const frames = await readStream(await chat({ message: 'hello' }));
    expect(frames.at(-1)).toMatchObject({ type: 'done', reason: 'complete' });
    expect(instructionsSent()).toMatch(/No session details/i);
  });
});

describe('token accounting', () => {
  beforeEach(async () => {
    await fetch(`${base}/api/me/llm-config`, {
      method: 'PUT',
      headers: authed(),
      body: JSON.stringify(CONFIG),
    });
  });

  it('reports usage on the done frame and records one row per turn', async () => {
    script.push([{ text: 'Short answer.', usage: { input: 250, output: 12 } }]);

    const frames = await readStream(await chat({ message: 'hi' }));

    expect(frames.at(-1)).toMatchObject({
      type: 'done',
      reason: 'complete',
      usage: { inputTokens: 250, outputTokens: 12, steps: 1 },
    });

    expect(usageRows).toHaveLength(1);
    expect(usageRows[0]).toMatchObject({
      userId: USER_ID,
      sessionId: 's1',
      model: 'test-model',
      // The host, never the full URL and never the key.
      providerHost: 'api.example.test',
      inputTokens: 250,
      outputTokens: 12,
      outcome: 'complete',
    });
  });

  // A provider that reports nothing must stay distinguishable from a turn that was free.
  it('records nulls rather than zeros when the provider reported no usage', async () => {
    script.push([{ text: 'hi' }]);

    await readStream(await chat({ message: 'hi' }));

    expect(usageRows[0]).toMatchObject({ inputTokens: null, outputTokens: null, steps: 1 });
  });

  it('records nothing when the turn never reached the provider', async () => {
    configs.clear();
    await readStream(await chat({ message: 'hi' }));
    expect(usageRows).toHaveLength(0);
  });

  it('summarises spend for the caller', async () => {
    const response = await fetch(`${base}/api/me/assistant-usage`, { headers: authed() });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ rows: [], since: expect.any(String) });
  });
});
