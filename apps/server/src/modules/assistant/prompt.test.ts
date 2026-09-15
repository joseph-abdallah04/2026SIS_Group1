import type { AssistantHistoryMessage } from '@roundtable/shared';
import { describe, expect, it } from 'vitest';

import { buildSystemPrompt } from './prompt.js';

const context = { sessionId: 's1', block: 'Session: Pick a database' };

const prompt = (history: AssistantHistoryMessage[] = []) => buildSystemPrompt(context, history);

describe('buildSystemPrompt', () => {
  it('always carries the persona and the live board', () => {
    const text = prompt();
    expect(text).toContain('RoundTable');
    expect(text).toContain('Session: Pick a database');
  });

  it('says nothing about past work when there is none', () => {
    expect(prompt()).not.toMatch(/What you have actually done/i);
  });

  it('counts the artifacts earlier turns really produced', () => {
    const text = prompt([
      { role: 'user', content: 'five notes please' },
      { role: 'assistant', content: 'Here you go.', artifacts: ['sticky', 'sticky', 'sticky'] },
      { role: 'user', content: 'and a picture' },
      { role: 'assistant', content: 'Drew it.', artifacts: ['diagram'] },
    ]);

    expect(text).toContain('3 sticky notes and 1 diagram');
  });

  // The failure the user watched happen is the one the model is most likely to paper over.
  it('states plainly that the last tool call produced nothing', () => {
    const text = prompt([
      { role: 'user', content: 'draw a login flow' },
      { role: 'assistant', content: 'Trying that.', failedTools: ['create_diagram'] },
    ]);

    expect(text).toContain('create_diagram');
    expect(text).toMatch(/FAILED and produced nothing/);
  });

  it('drops a stale failure once a later turn succeeded', () => {
    const text = prompt([
      { role: 'assistant', content: 'Trying that.', failedTools: ['create_diagram'] },
      { role: 'user', content: 'try again' },
      { role: 'assistant', content: 'Here it is.', artifacts: ['diagram'] },
    ]);

    expect(text).not.toMatch(/FAILED/);
    expect(text).toContain('1 diagram');
  });

  it('forbids claiming work that did not happen', () => {
    const text = prompt();
    expect(text).toMatch(/only when a tool call in THIS turn returned one/i);
    expect(text).toMatch(/no parenthetical notes|no bracketed asides/i);
  });
});
