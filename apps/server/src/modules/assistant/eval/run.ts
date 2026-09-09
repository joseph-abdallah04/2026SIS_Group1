// Behaviour eval for the assistant: `npm run eval --workspace @roundtable/server`.
//
// Unit tests script the provider, so they prove the plumbing and nothing about the model's
// judgement. This runs the real agent against a real provider and checks what it decided:
// did it reach for a tool when it should have, and stay quiet when it should not.
//
// Deliberately NOT in CI — it costs money, needs a key, and a model provider having a bad
// afternoon is not a reason to fail someone's pull request. Run it after touching prompt.ts
// or the tool descriptions, and before a demo.
//
// Credentials come from the environment rather than the database, so this needs no Postgres
// and no login:
//
//   EVAL_BASE_URL=https://api.groq.com/openai/v1 \
//   EVAL_API_KEY=gsk_... \
//   EVAL_MODEL=openai/gpt-oss-120b \
//   npm run eval --workspace @roundtable/server
import type { AssistantStreamEvent } from '@roundtable/shared';

import { runAssistantTurn } from '../agent.js';
import type { LlmCredentials } from '../llm.js';
import { buildSystemPrompt } from '../prompt.js';
import { EVAL_CASES, type EvalCase } from './cases.js';

const TURN_TIMEOUT_MS = 90_000;

interface CaseResult {
  id: string;
  ok: boolean;
  failures: string[];
  toolsUsed: string[];
  replyChars: number;
  ms: number;
}

function credentialsFromEnv(): LlmCredentials {
  const baseUrl = process.env.EVAL_BASE_URL;
  const apiKey = process.env.EVAL_API_KEY;
  const model = process.env.EVAL_MODEL;
  if (!baseUrl || !apiKey || !model) {
    console.error(
      'Set EVAL_BASE_URL, EVAL_API_KEY and EVAL_MODEL. Example:\n\n' +
        '  EVAL_BASE_URL=https://api.groq.com/openai/v1 \\\n' +
        '  EVAL_API_KEY=gsk_... \\\n' +
        '  EVAL_MODEL=openai/gpt-oss-120b \\\n' +
        '  npm run eval --workspace @roundtable/server\n',
    );
    process.exit(2);
  }
  return { baseUrl, apiKey, model };
}

async function runCase(testCase: EvalCase, credentials: LlmCredentials): Promise<CaseResult> {
  const events: AssistantStreamEvent[] = [];
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TURN_TIMEOUT_MS);
  const startedAt = Date.now();

  try {
    await runAssistantTurn({
      credentials,
      systemPrompt: buildSystemPrompt({
        sessionId: 'eval-session',
        sessionTitle: 'Eval',
        block: testCase.contextBlock ?? '',
      }),
      history: testCase.history ?? [],
      message: testCase.message,
      emit: (event) => events.push(event),
      signal: controller.signal,
    });
  } catch (cause) {
    clearTimeout(timer);
    return {
      id: testCase.id,
      ok: false,
      failures: [`turn threw: ${cause instanceof Error ? cause.message : String(cause)}`],
      toolsUsed: [],
      replyChars: 0,
      ms: Date.now() - startedAt,
    };
  }
  clearTimeout(timer);

  const reply = events
    .filter((event) => event.type === 'message')
    .map((event) => event.content)
    .join('');
  const toolsUsed = events.filter((event) => event.type === 'tool').map((event) => event.toolName);
  const artifacts = events.filter((event) => event.type === 'artifact');

  const failures: string[] = [];

  // Universal: a turn that says nothing is a bug however it decided about tools. This is the
  // check that would have caught the mute assistant.
  if (reply.trim().length === 0) {
    failures.push('emitted no text at all');
  }

  if (testCase.expectTool === 'none') {
    if (toolsUsed.length > 0) failures.push(`used ${toolsUsed.join(', ')}; expected no tool`);
  } else if (!toolsUsed.includes(testCase.expectTool)) {
    failures.push(
      `expected ${testCase.expectTool}; used ${toolsUsed.length > 0 ? toolsUsed.join(', ') : 'no tool'}`,
    );
  }

  if (testCase.expectArtifacts) {
    const { type, min } = testCase.expectArtifacts;
    const count = artifacts.filter((event) => event.artifact.type === type).length;
    if (count < min) failures.push(`expected ≥${min} ${type} artifacts; got ${count}`);
  }

  for (const needle of testCase.expectMentions ?? []) {
    if (!reply.toLowerCase().includes(needle.toLowerCase())) {
      failures.push(`reply never mentions "${needle}"`);
    }
  }

  return {
    id: testCase.id,
    ok: failures.length === 0,
    failures,
    toolsUsed,
    replyChars: reply.trim().length,
    ms: Date.now() - startedAt,
  };
}

async function main(): Promise<void> {
  const credentials = credentialsFromEnv();
  const only = process.argv[2];
  const cases = only ? EVAL_CASES.filter((c) => c.id.includes(only)) : EVAL_CASES;

  if (cases.length === 0) {
    console.error(`No cases match "${only}".`);
    process.exit(2);
  }

  console.log(`\n${credentials.model} @ ${credentials.baseUrl} — ${cases.length} cases\n`);

  const results: CaseResult[] = [];
  // Sequential on purpose: providers rate-limit, and a 429 storm would read as a behaviour
  // regression when it is nothing of the sort.
  for (const testCase of cases) {
    const result = await runCase(testCase, credentials);
    results.push(result);
    const mark = result.ok ? '✓' : '✗';
    const tools = result.toolsUsed.length > 0 ? result.toolsUsed.join(',') : '—';
    console.log(
      `${mark} ${result.id.padEnd(38)} ${tools.padEnd(18)} ${String(result.replyChars).padStart(5)} chars  ${String(result.ms).padStart(6)}ms`,
    );
    for (const failure of result.failures) console.log(`    ${failure}`);
  }

  const failed = results.filter((result) => !result.ok);
  console.log(`\n${results.length - failed.length}/${results.length} passed\n`);

  if (failed.length > 0) {
    for (const result of failed) {
      const testCase = cases.find((c) => c.id === result.id);
      if (testCase) console.log(`${result.id}: ${testCase.rationale}`);
    }
    console.log('');
    process.exit(1);
  }
}

await main();
