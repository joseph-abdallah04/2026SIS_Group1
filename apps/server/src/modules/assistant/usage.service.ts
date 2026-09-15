// Token accounting for assistant turns.
//
// Users bring their own provider and pay their own bill, so the honest thing is to show
// them what the assistant spent. This records one row per turn and reads it back as a
// per-model summary.
//
// Two rules shape the whole file:
//
//   1. Recording must never break a turn. The user got their answer; failing the request
//      afterwards because a bookkeeping insert failed would be absurd.
//   2. A token count the provider did not report stays NULL. Summing NULL as zero would
//      quietly under-report a bill, which is the one direction a cost display must never
//      be wrong in.
import type { AssistantUsage } from '@roundtable/shared';

import { prisma } from '../../db.js';

export type TurnOutcomeLabel = 'complete' | 'max-steps' | 'aborted' | 'error';

export interface RecordTurnUsageInput {
  userId: string;
  sessionId: string;
  /** The provider's base URL — only its host is stored. */
  baseUrl: string;
  model: string;
  usage: AssistantUsage;
  outcome: TurnOutcomeLabel;
}

/** Per-model totals over a window, plus the turns that reported nothing. */
export interface UsageSummaryRow {
  model: string;
  providerHost: string;
  turns: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  /** Turns whose provider reported no usage — the totals above exclude them. */
  turnsWithoutUsage: number;
}

export interface UsageSummary {
  since: string;
  rows: UsageSummaryRow[];
}

export async function recordTurnUsage(input: RecordTurnUsageInput): Promise<void> {
  const { usage } = input;

  try {
    await prisma.assistantTurnUsage.create({
      data: {
        userId: input.userId,
        sessionId: input.sessionId,
        providerHost: hostOf(input.baseUrl),
        model: input.model,
        inputTokens: usage.inputTokens ?? null,
        outputTokens: usage.outputTokens ?? null,
        totalTokens: usage.totalTokens ?? null,
        reasoningTokens: usage.reasoningTokens ?? null,
        cachedInputTokens: usage.cachedInputTokens ?? null,
        steps: usage.steps,
        durationMs: usage.durationMs,
        outcome: input.outcome,
      },
    });
  } catch (cause) {
    console.error('assistant: failed to record turn usage', cause);
  }
}

/** Default window for the usage endpoint. */
const DEFAULT_WINDOW_DAYS = 30;

export async function summarizeUsage(
  userId: string,
  windowDays = DEFAULT_WINDOW_DAYS,
): Promise<UsageSummary> {
  const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);

  const grouped = await prisma.assistantTurnUsage.groupBy({
    by: ['model', 'providerHost'],
    where: { userId, createdAt: { gte: since } },
    _count: { _all: true },
    _sum: { inputTokens: true, outputTokens: true, totalTokens: true },
  });

  // `_sum` skips NULLs, so a model whose provider reports nothing shows real turn counts
  // against zero tokens. Counting those turns separately is what keeps that readable
  // rather than looking like a bug.
  const withoutUsage = await prisma.assistantTurnUsage.groupBy({
    by: ['model', 'providerHost'],
    where: { userId, createdAt: { gte: since }, totalTokens: null },
    _count: { _all: true },
  });

  const missing = new Map(
    withoutUsage.map((row) => [`${row.providerHost}\u0000${row.model}`, row._count._all]),
  );

  return {
    since: since.toISOString(),
    rows: grouped
      .map((row) => ({
        model: row.model,
        providerHost: row.providerHost,
        turns: row._count._all,
        inputTokens: row._sum.inputTokens ?? 0,
        outputTokens: row._sum.outputTokens ?? 0,
        totalTokens: row._sum.totalTokens ?? 0,
        turnsWithoutUsage: missing.get(`${row.providerHost}\u0000${row.model}`) ?? 0,
      }))
      .sort((a, b) => b.totalTokens - a.totalTokens || b.turns - a.turns),
  };
}

/** Host only — the full URL can carry a path or query a user would not expect us to keep. */
function hostOf(baseUrl: string): string {
  try {
    return new URL(baseUrl).host;
  } catch {
    return 'unknown';
  }
}
