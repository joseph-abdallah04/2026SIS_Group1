import type { Question, QuestionStatus } from '@roundtable/shared';
import { describe, expect, it } from 'vitest';

import { progressText, stepState, summarizeAgenda } from './agendaSummary';

function questions(...statuses: QuestionStatus[]): Question[] {
  return statuses.map((status, position) => ({
    id: `q${position + 1}`,
    sessionId: 's1',
    text: `Question ${position + 1}`,
    position,
    status,
    createdAt: new Date(0),
  }));
}

describe('stepState', () => {
  it('puts discussion and voting in play while the session runs', () => {
    expect(stepState('discussion')).toBe('live');
    expect(stepState('voting')).toBe('live');
    expect(stepState('pending')).toBe('pending');
    expect(stepState('answered')).toBe('answered');
    expect(stepState('skipped')).toBe('skipped');
  });

  it('counts a question left open as unfinished once the session has ended', () => {
    expect(stepState('discussion', true)).toBe('pending');
    expect(stepState('voting', true)).toBe('pending');
    expect(stepState('answered', true)).toBe('answered');
  });
});

describe('summarizeAgenda', () => {
  it('counts answered and skipped as done, in agenda order', () => {
    const summary = summarizeAgenda(questions('answered', 'skipped', 'voting', 'pending'));
    expect(summary).toEqual({
      answered: 1,
      skipped: 1,
      done: 2,
      total: 4,
      steps: ['answered', 'skipped', 'live', 'pending'],
    });
  });

  it('has nothing live in an ended session', () => {
    const summary = summarizeAgenda(questions('answered', 'discussion'), { ended: true });
    expect(summary.steps).toEqual(['answered', 'pending']);
    expect(summary.done).toBe(1);
  });

  it('summarises an empty agenda as nothing done of nothing', () => {
    expect(summarizeAgenda([])).toEqual({ answered: 0, skipped: 0, done: 0, total: 0, steps: [] });
  });
});

describe('progressText', () => {
  it('reads the count, and the skipped ones when there are any', () => {
    expect(progressText(summarizeAgenda(questions('answered', 'pending')))).toBe(
      '1 of 2 questions done',
    );
    expect(progressText(summarizeAgenda(questions('skipped', 'answered', 'pending')))).toBe(
      '2 of 3 questions done, including 1 skipped',
    );
    expect(progressText(summarizeAgenda(questions('answered')))).toBe('1 of 1 question done');
  });
});
