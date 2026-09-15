import type { AssistantHistoryMessage } from '@roundtable/shared';
import { describe, expect, it } from 'vitest';

import { buildSystemPrompt, STOPPED_TURN_NOTE } from './prompt.js';

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
    expect(prompt()).not.toMatch(/This chat so far/i);
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

  it('states that the user stopped the last reply', () => {
    const text = prompt([
      { role: 'user', content: 'draw a login flow' },
      { role: 'assistant', content: 'Half of an answ', interrupted: true },
    ]);

    expect(text).toContain(STOPPED_TURN_NOTE);
    expect(text).toContain('draw a login flow');
    expect(text).toContain('It was the reply to:');
    expect(text).not.toMatch(/say they cancelled|say you pressed/i);
  });

  it('drops a stale stop once a later reply finished', () => {
    const text = prompt([
      { role: 'assistant', content: 'Half of an answ', interrupted: true },
      { role: 'user', content: 'why did you stop?' },
      { role: 'assistant', content: 'You cancelled it.' },
    ]);

    expect(text).not.toContain(STOPPED_TURN_NOTE);
  });

  it('puts this chat in the instructions so the model cannot deny seeing it', () => {
    const text = prompt([
      { role: 'user', content: "That's okay" },
      { role: 'assistant', content: 'Sounds good.' },
      { role: 'user', content: 'What was my last prompt to you?' },
    ]);

    expect(text).toContain("That's okay");
    expect(text).toContain('Sounds good.');
    expect(text).toContain('<untrusted');
    expect(text).toMatch(/never claim you cannot recall this conversation/i);
  });

  it('treats client-reported artifacts as a UI report, not a server record', () => {
    const text = prompt([{ role: 'assistant', content: 'Here.', artifacts: ['diagram'] }]);
    expect(text).toMatch(/chat UI reported/i);
    expect(text).not.toMatch(/What you have actually done in this chat \(facts/i);
  });
});
