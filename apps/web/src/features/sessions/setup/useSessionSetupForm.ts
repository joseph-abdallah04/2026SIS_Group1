import { useCallback, useMemo, useReducer, useRef } from 'react';
import {
  createSessionSchema,
  SESSION_QUESTION_LIMIT,
  SESSION_QUESTION_TEXT_MAX,
  sessionIssueMessage,
  updateSessionSchema,
  type CreateSessionInput,
  type SessionQuestionInput,
} from '@roundtable/shared/schemas';

import type { SessionTemplate } from '../templates';

/** One question as the form holds it: its key stays with it however it moves. */
export interface SetupQuestion extends SessionQuestionInput {
  key: string;
}

export type SetupTimer = 'discussion' | 'voting';

export interface SetupFormState {
  title: string;
  /** What the empty title box shows: the applied template's example, or the default. */
  titlePlaceholder: string;
  /** In order: the order here is exactly the `position` the server assigns. */
  questions: SetupQuestion[];
  /** `null` is that clock off. */
  discussionTimerSeconds: number | null;
  votingTimerSeconds: number | null;
  /** Live call (true) or no call (false). */
  voiceEnabled: boolean;
  /** The template last applied, if any. */
  templateId: string | null;
  /**
   * Whether the leader has changed anything since the form was filled: from a
   * draft, from a template, or empty. A template's own content is not work
   * anyone would lose.
   */
  edited: boolean;
}

export interface SetupFormInit {
  title?: string;
  questions?: SessionQuestionInput[];
  discussionTimerSeconds?: number | null;
  votingTimerSeconds?: number | null;
  voiceEnabled?: boolean;
  /** Fill from this template instead (the other fields are ignored). */
  template?: SessionTemplate | null;
}

export const DEFAULT_TITLE_PLACEHOLDER = 'What is this session about?';

type Action =
  | { type: 'title'; text: string }
  | { type: 'question-text'; key: string; text: string }
  | { type: 'question-voting'; key: string; votingEnabled: boolean }
  | { type: 'add'; key: string; after: string | null }
  | { type: 'remove'; key: string }
  | { type: 'move'; key: string; to: number }
  | { type: 'insert-lines'; key: string; lines: string[]; keys: string[] }
  | { type: 'timer'; timer: SetupTimer; seconds: number | null }
  | { type: 'voice'; voiceEnabled: boolean }
  | { type: 'template'; template: SessionTemplate; keys: string[] }
  | { type: 'restore'; state: SetupFormState };

/** A fresh row is a voting question, what every question was before F41. */
function blankQuestion(key: string): SetupQuestion {
  return { key, text: '', votingEnabled: true };
}

function withKeys(questions: SessionQuestionInput[], keys: string[]): SetupQuestion[] {
  return questions.map(({ text, votingEnabled }, index) => ({
    key: keys[index] ?? `q-${index}`,
    text,
    votingEnabled,
  }));
}

function fromTemplate(template: SessionTemplate, keys: string[]): SetupFormState {
  return {
    title: template.title,
    titlePlaceholder: template.titlePlaceholder || DEFAULT_TITLE_PLACEHOLDER,
    questions:
      template.questions.length > 0
        ? withKeys(template.questions, keys)
        : [blankQuestion(keys[0] ?? 'q-0')],
    discussionTimerSeconds: template.discussionTimerSeconds,
    votingTimerSeconds: template.votingTimerSeconds,
    voiceEnabled: template.voiceEnabled,
    templateId: template.id,
    edited: false,
  };
}

/** How many keys filling from this init or template needs. */
function keysNeeded(questions: readonly SessionQuestionInput[]) {
  return Math.max(1, questions.length);
}

export function initialSetupState(init: SetupFormInit, makeKey: () => string): SetupFormState {
  if (init.template) {
    return fromTemplate(
      init.template,
      Array.from({ length: keysNeeded(init.template.questions) }, makeKey),
    );
  }
  const questions = init.questions ?? [];
  return {
    title: init.title ?? '',
    titlePlaceholder: DEFAULT_TITLE_PLACEHOLDER,
    questions:
      questions.length > 0
        ? withKeys(
            questions,
            questions.map(() => makeKey()),
          )
        : [blankQuestion(makeKey())],
    discussionTimerSeconds: init.discussionTimerSeconds ?? null,
    votingTimerSeconds: init.votingTimerSeconds ?? null,
    voiceEnabled: init.voiceEnabled ?? false,
    templateId: null,
    edited: false,
  };
}

function edit(state: SetupFormState, change: Partial<SetupFormState>): SetupFormState {
  return { ...state, ...change, edited: true };
}

export function setupReducer(state: SetupFormState, action: Action): SetupFormState {
  switch (action.type) {
    case 'title':
      return edit(state, { title: action.text });
    case 'question-text':
      return edit(state, {
        questions: state.questions.map((q) =>
          q.key === action.key ? { ...q, text: action.text } : q,
        ),
      });
    case 'question-voting':
      return edit(state, {
        questions: state.questions.map((q) =>
          q.key === action.key ? { ...q, votingEnabled: action.votingEnabled } : q,
        ),
      });
    case 'add': {
      if (state.questions.length >= SESSION_QUESTION_LIMIT) return state;
      const at =
        action.after === null
          ? state.questions.length
          : state.questions.findIndex((q) => q.key === action.after) + 1;
      const questions = [...state.questions];
      questions.splice(at <= 0 ? questions.length : at, 0, blankQuestion(action.key));
      return edit(state, { questions });
    }
    case 'remove':
      // There is always one row to write in.
      if (state.questions.length <= 1) return state;
      return edit(state, { questions: state.questions.filter((q) => q.key !== action.key) });
    case 'move': {
      const from = state.questions.findIndex((q) => q.key === action.key);
      const to = Math.min(state.questions.length - 1, Math.max(0, action.to));
      if (from < 0 || from === to) return state;
      const questions = [...state.questions];
      const [moved] = questions.splice(from, 1);
      if (!moved) return state;
      questions.splice(to, 0, moved);
      return edit(state, { questions });
    }
    case 'insert-lines': {
      const at = state.questions.findIndex((q) => q.key === action.key);
      const current = state.questions[at];
      if (!current || action.lines.length === 0) return state;
      // An empty row takes the first line; a written one keeps its text and
      // every line becomes a question after it.
      const fill = current.text.trim() === '';
      const rest = fill ? action.lines.slice(1) : action.lines;
      const room = SESSION_QUESTION_LIMIT - state.questions.length;
      const added = rest.slice(0, room).map((text, index) => ({
        ...blankQuestion(action.keys[index] ?? `${action.key}-${index}`),
        text,
      }));
      const questions = [...state.questions];
      if (fill) questions[at] = { ...current, text: action.lines[0] ?? '' };
      questions.splice(at + 1, 0, ...added);
      return edit(state, { questions });
    }
    case 'timer':
      return edit(
        state,
        action.timer === 'discussion'
          ? { discussionTimerSeconds: action.seconds || null }
          : { votingTimerSeconds: action.seconds || null },
      );
    case 'voice':
      return edit(state, { voiceEnabled: action.voiceEnabled });
    case 'template':
      return fromTemplate(action.template, action.keys);
    case 'restore':
      return action.state;
    default:
      return state;
  }
}

/**
 * A paste of several lines, one question each: blank lines dropped, and the
 * bullets or numbers of a copied list taken off. `null` for a single line,
 * which pastes as ordinary text. A line is never cut short: one over the
 * limit shows its counter in red and is named on submit, rather than losing
 * its end without a word.
 */
export function splitPastedLines(text: string): string[] | null {
  if (!/\r?\n/.test(text.trim())) return null;
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*(?:[-*•]|\d+[.)])\s+/, '').trim())
    .filter((line) => line.length > 0);
  return lines.length > 0 ? lines : null;
}

/** What a paste did: the rows holding its lines, and what to tell the leader. */
export interface PasteResult {
  /** The rows that now hold pasted lines, in order. */
  keys: string[];
  /** Lines left out because the agenda was full. */
  dropped: number;
  /** Pasted lines over the question limit, kept whole to be shortened. */
  long: number;
}

export function hasContent(state: SetupFormState): boolean {
  return state.title.trim().length > 0 || state.questions.some((q) => q.text.trim().length > 0);
}

/** Why the form cannot be sent yet, in the words the page shows; `null` once it can. */
export function notReadyReason(state: SetupFormState): string | null {
  if (state.title.trim().length === 0) return 'Name the session to continue';
  if (!state.questions.some((q) => q.text.trim().length > 0)) return 'Add a question to continue';
  return null;
}

/**
 * What the form sends, checked the way the server will check it. Empty rows
 * are dropped. A draft being edited takes the old, longer question limit
 * (`updateSessionSchema`), so a draft written before the limit came down still
 * saves.
 */
export function setupFormInput(
  state: SetupFormState,
  editingDraft: boolean,
): { ok: true; input: CreateSessionInput } | { ok: false; message: string } {
  const parsed = (editingDraft ? updateSessionSchema : createSessionSchema).safeParse({
    title: state.title,
    questions: state.questions
      .map(({ text, votingEnabled }) => ({ text: text.trim(), votingEnabled }))
      .filter((q) => q.text.length > 0),
    discussionTimerSeconds: state.discussionTimerSeconds,
    votingTimerSeconds: state.votingTimerSeconds,
    voiceEnabled: state.voiceEnabled,
  });
  if (!parsed.success) {
    return { ok: false, message: sessionIssueMessage(parsed.error.issues, 'Invalid session') };
  }
  return { ok: true, input: parsed.data };
}

/**
 * The session setup form's state and every edit to it, shared by creating a
 * session and editing a draft. Questions carry a key that moves with them, so
 * focus, drag and React's own bookkeeping follow the question rather than the
 * place it used to be.
 */
export function useSessionSetupForm(init: SetupFormInit) {
  const counter = useRef(0);
  const makeKey = useCallback(() => `q${++counter.current}`, []);
  const [state, dispatch] = useReducer(setupReducer, init, (value) =>
    initialSetupState(value, makeKey),
  );
  // The latest state for the edits that answer with something (a key to focus,
  // a snapshot to undo to), read between renders.
  const current = useRef(state);
  current.current = state;

  const actions = useMemo(
    () => ({
      setTitle: (text: string) => dispatch({ type: 'title', text }),
      setQuestionText: (key: string, text: string) =>
        dispatch({ type: 'question-text', key, text }),
      setQuestionVoting: (key: string, votingEnabled: boolean) =>
        dispatch({ type: 'question-voting', key, votingEnabled }),
      setTimer: (timer: SetupTimer, seconds: number | null) =>
        dispatch({ type: 'timer', timer, seconds }),
      setVoiceEnabled: (voiceEnabled: boolean) => dispatch({ type: 'voice', voiceEnabled }),
      /** Adds an empty question after `after` (or at the end); its key, or `null` at the limit. */
      addQuestion: (after: string | null = null): string | null => {
        if (current.current.questions.length >= SESSION_QUESTION_LIMIT) return null;
        const key = makeKey();
        dispatch({ type: 'add', key, after });
        return key;
      },
      /** Removes a question; the key of the one to carry on in (the one before, or after). */
      removeQuestion: (key: string): string | null => {
        const list = current.current.questions;
        if (list.length <= 1) return null;
        const index = list.findIndex((q) => q.key === key);
        dispatch({ type: 'remove', key });
        return (list[index - 1] ?? list[index + 1])?.key ?? null;
      },
      moveQuestion: (key: string, to: number) => dispatch({ type: 'move', key, to }),
      /**
       * Puts pasted lines in as questions from `key`, as many as the agenda
       * has room for. Answers with the rows that now hold them, and how many
       * lines were left out or run long, for the page to say so.
       */
      pasteLines: (key: string, lines: string[]): PasteResult => {
        const list = current.current.questions;
        const row = list.find((q) => q.key === key);
        if (!row) return { keys: [], dropped: 0, long: 0 };
        const fill = row.text.trim() === '';
        const room = SESSION_QUESTION_LIMIT - list.length;
        const rest = fill ? lines.slice(1) : lines;
        const keys = rest.slice(0, room).map(() => makeKey());
        dispatch({ type: 'insert-lines', key, lines, keys });
        const placed = fill ? lines.slice(0, keys.length + 1) : rest.slice(0, keys.length);
        return {
          keys: fill ? [key, ...keys] : keys,
          dropped: rest.length - keys.length,
          long: placed.filter((line) => line.length > SESSION_QUESTION_TEXT_MAX).length,
        };
      },
      /**
       * Fills the form from a template. Answers with what it held before, to
       * undo with `restore`, and the keys of the questions it put in.
       */
      applyTemplate: (template: SessionTemplate): { before: SetupFormState; keys: string[] } => {
        const before = current.current;
        const keys = Array.from({ length: keysNeeded(template.questions) }, makeKey);
        dispatch({ type: 'template', template, keys });
        return { before, keys };
      },
      restore: (snapshot: SetupFormState) => dispatch({ type: 'restore', state: snapshot }),
      /**
       * Picks a kept form back up (from this browser's storage, not this
       * page): its questions get fresh keys, since theirs came from another
       * page's counter. Answers with those keys. It is the leader's own work.
       */
      resume: (snapshot: SetupFormState): string[] => {
        const keys = snapshot.questions.map(() => makeKey());
        dispatch({
          type: 'restore',
          state: {
            ...snapshot,
            questions: snapshot.questions.map((q, index) => ({ ...q, key: keys[index] ?? q.key })),
            edited: true,
          },
        });
        return keys;
      },
    }),
    [makeKey],
  );

  return {
    state,
    ...actions,
    canAddQuestion: state.questions.length < SESSION_QUESTION_LIMIT,
    notReady: notReadyReason(state),
    /** Something the leader wrote would be lost by leaving. */
    hasUnsavedWork: state.edited && hasContent(state),
  };
}
