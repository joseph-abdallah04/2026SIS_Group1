import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SESSION_QUESTION_LIMIT } from '@roundtable/shared/schemas';

import { findTemplate, BUILT_IN_TEMPLATES } from '../templates';
import {
  initialSetupState,
  notReadyReason,
  setupFormInput,
  setupReducer,
  splitPastedLines,
  useSessionSetupForm,
  type SetupFormState,
} from './useSessionSetupForm';

function keys() {
  let n = 0;
  return () => `k${++n}`;
}

function stateWith(texts: string[]): SetupFormState {
  return initialSetupState(
    { title: 'Roadmap', questions: texts.map((text) => ({ text, votingEnabled: true })) },
    keys(),
  );
}

const texts = (state: SetupFormState) => state.questions.map((q) => q.text);
const retro = findTemplate(BUILT_IN_TEMPLATES, 'retrospective')!;

describe('setupReducer', () => {
  it('starts with one empty voting question and no call', () => {
    const state = initialSetupState({}, keys());
    expect(state.questions).toEqual([{ key: 'k1', text: '', votingEnabled: true }]);
    expect(state.voiceEnabled).toBe(false);
    expect(state.edited).toBe(false);
  });

  it('adds a question after another, or at the end', () => {
    let state = stateWith(['A', 'B']);
    state = setupReducer(state, { type: 'add', key: 'x', after: 'k1' });
    expect(state.questions.map((q) => q.key)).toEqual(['k1', 'x', 'k2']);
    state = setupReducer(state, { type: 'add', key: 'y', after: null });
    expect(state.questions.map((q) => q.key)).toEqual(['k1', 'x', 'k2', 'y']);
    expect(state.edited).toBe(true);
  });

  it('stops adding at the session limit', () => {
    const full = stateWith(Array.from({ length: SESSION_QUESTION_LIMIT }, (_, i) => `Q${i}`));
    expect(setupReducer(full, { type: 'add', key: 'x', after: null })).toBe(full);
  });

  it('never removes the last question', () => {
    const one = stateWith(['A']);
    expect(setupReducer(one, { type: 'remove', key: 'k1' })).toBe(one);
  });

  it('moves a question, keeping its key and vote choice with it', () => {
    let state = stateWith(['A', 'B', 'C']);
    state = setupReducer(state, { type: 'question-voting', key: 'k3', votingEnabled: false });
    state = setupReducer(state, { type: 'move', key: 'k3', to: 0 });
    expect(state.questions[0]).toEqual({ key: 'k3', text: 'C', votingEnabled: false });
    expect(texts(state)).toEqual(['C', 'A', 'B']);
  });

  it('puts pasted lines into an empty row first, then after it', () => {
    const state = setupReducer(initialSetupState({}, keys()), {
      type: 'insert-lines',
      key: 'k1',
      lines: ['One', 'Two', 'Three'],
      keys: ['p1', 'p2'],
    });
    expect(texts(state)).toEqual(['One', 'Two', 'Three']);
  });

  it('keeps a written row and adds every pasted line after it', () => {
    const state = setupReducer(stateWith(['Written', 'Last']), {
      type: 'insert-lines',
      key: 'k1',
      lines: ['One', 'Two'],
      keys: ['p1', 'p2'],
    });
    expect(texts(state)).toEqual(['Written', 'One', 'Two', 'Last']);
  });

  it('stops a paste at the session limit', () => {
    const nearly = stateWith(Array.from({ length: SESSION_QUESTION_LIMIT - 1 }, (_, i) => `Q${i}`));
    const state = setupReducer(nearly, {
      type: 'insert-lines',
      key: 'k1',
      lines: ['One', 'Two', 'Three'],
      keys: ['p1', 'p2', 'p3'],
    });
    expect(state.questions).toHaveLength(SESSION_QUESTION_LIMIT);
  });

  it('turns a timer set to zero off', () => {
    const state = setupReducer(stateWith(['A']), { type: 'timer', timer: 'voting', seconds: 0 });
    expect(state.votingTimerSeconds).toBeNull();
  });

  it('fills everything from a template, as nothing the leader wrote', () => {
    const state = setupReducer(stateWith(['Mine']), {
      type: 'template',
      template: retro,
      keys: ['t1', 't2', 't3', 't4'],
    });
    expect(state).toMatchObject({
      title: 'Sprint retro',
      titlePlaceholder: 'Sprint 23 retro',
      discussionTimerSeconds: retro.discussionTimerSeconds,
      votingTimerSeconds: retro.votingTimerSeconds,
      voiceEnabled: true,
      templateId: 'retrospective',
      edited: false,
    });
    expect(texts(state)).toEqual(retro.questions.map((q) => q.text));
  });
});

describe('splitPastedLines', () => {
  it('takes one question per line, without bullets, numbers or blank lines', () => {
    expect(splitPastedLines('- First\n2. Second\n\n  * Third  \r\n4) Fourth')).toEqual([
      'First',
      'Second',
      'Third',
      'Fourth',
    ]);
  });

  it('leaves a single line to paste as text', () => {
    expect(splitPastedLines('Just one line\n')).toBeNull();
  });
});

describe('setupFormInput', () => {
  it('drops empty rows, trims the rest and turns unset timers into null', () => {
    const state = stateWith(['  Keep me  ', '   ']);
    expect(setupFormInput(state, false)).toEqual({
      ok: true,
      input: {
        title: 'Roadmap',
        questions: [{ text: 'Keep me', votingEnabled: true }],
        discussionTimerSeconds: null,
        votingTimerSeconds: null,
        voiceEnabled: false,
      },
    });
  });

  it('names a question that is too long for a new session, but lets a draft keep it', () => {
    const state = stateWith(['Fine', 'x'.repeat(200)]);
    expect(setupFormInput(state, false)).toEqual({
      ok: false,
      message: 'Question 2 is longer than 150 characters',
    });
    expect(setupFormInput(state, true).ok).toBe(true);
  });

  it('says what is missing before the form can go', () => {
    expect(notReadyReason(initialSetupState({}, keys()))).toBe('Name the session to continue');
    expect(notReadyReason(initialSetupState({ title: 'T' }, keys()))).toBe(
      'Add a question to continue',
    );
    expect(notReadyReason(stateWith(['Q']))).toBeNull();
  });
});

describe('useSessionSetupForm', () => {
  it('only counts the leader’s own changes as work to lose', () => {
    const { result } = renderHook(() => useSessionSetupForm({}));
    expect(result.current.hasUnsavedWork).toBe(false);

    act(() => {
      result.current.applyTemplate(retro);
    });
    expect(result.current.hasUnsavedWork).toBe(false);

    act(() => result.current.setTitle('Our retro'));
    expect(result.current.hasUnsavedWork).toBe(true);
  });

  it('hands back what it replaced, so a template can be undone', () => {
    const { result } = renderHook(() =>
      useSessionSetupForm({
        title: 'Mine',
        questions: [{ text: 'My question', votingEnabled: true }],
      }),
    );
    let before: SetupFormState | undefined;
    act(() => {
      before = result.current.applyTemplate(retro).before;
    });
    expect(result.current.state.title).toBe('Sprint retro');

    act(() => result.current.restore(before!));
    expect(result.current.state.title).toBe('Mine');
    expect(texts(result.current.state)).toEqual(['My question']);
  });

  it('answers each edit with the question to carry on in', () => {
    const { result } = renderHook(() =>
      useSessionSetupForm({
        questions: [
          { text: 'A', votingEnabled: true },
          { text: 'B', votingEnabled: true },
        ],
      }),
    );
    const [a, b] = result.current.state.questions.map((q) => q.key);
    let added: string | null = null;
    act(() => {
      added = result.current.addQuestion(a);
    });
    expect(result.current.state.questions.map((q) => q.key)).toEqual([a, added, b]);

    let neighbour: string | null = null;
    act(() => {
      neighbour = result.current.removeQuestion(added!);
    });
    expect(neighbour).toBe(a);

    let pasted: string[] = [];
    act(() => {
      pasted = result.current.pasteLines(b!, ['C', 'D']);
    });
    expect(pasted).toHaveLength(2);
    expect(texts(result.current.state)).toEqual(['A', 'B', 'C', 'D']);
  });
});
