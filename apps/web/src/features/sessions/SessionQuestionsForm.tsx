import { GripVertical, History, Lock, Undo2 } from 'lucide-react';
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ClipboardEvent,
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import {
  DISCUSSION_TIMER_MAX_SECONDS,
  SESSION_QUESTION_LIMIT,
  SESSION_QUESTION_TEXT_MAX,
  VOTING_TIMER_MAX_SECONDS,
  type CreateSessionInput,
  type SessionQuestionInput,
} from '@roundtable/shared/schemas';

import { closingFades } from '../../lib/motion';
import { useDragReorder } from '../../lib/useDragReorder';
import { CallChoice } from './setup/CallChoice';
import { savedAgo } from './setup/setupAutosave';
import { QuestionRow } from './setup/QuestionRow';
import { FactLine } from './setup/FactLine';
import { sessionFacts } from './setup/setupSummary';
import { useSetupAutosave } from './setup/useSetupAutosave';
import { TemplateCards } from './setup/TemplateCards';
import { TimerPresets } from './setup/TimerPresets';
import {
  setupFormInput,
  splitPastedLines,
  useSessionSetupForm,
  type SetupFormState,
} from './setup/useSessionSetupForm';
import type { SessionTemplate } from './templates';

/** A button in the footer: what it is called, and what it sends the form for. */
export interface SetupAction {
  /** Handed back to `onSubmit`, to say which button sent it. */
  kind: string;
  label: string;
  /** Shown on the button while `busy` names it. */
  busyLabel: string;
  /** The one Ctrl/⌘+Enter presses, drawn in the accent. Exactly one should be. */
  primary?: boolean;
  icon?: ReactNode;
}

interface SessionQuestionsFormProps {
  initialTitle?: string;
  initialQuestions?: SessionQuestionInput[];
  initialDiscussionTimerSeconds?: number | null;
  initialVotingTimerSeconds?: number | null;
  /** Live call (true) or no call (false). New sessions start with no call. */
  initialVoiceEnabled?: boolean;
  /** Start from this template instead of the values above. */
  initialTemplate?: SessionTemplate | null;
  /** The templates to offer as cards above the questions; none on the edit page. */
  templates?: readonly SessionTemplate[];
  /** The footer's buttons, in order, the primary one last. */
  actions: SetupAction[];
  /** The action whose request is on its way, if any. */
  busy: string | null;
  /** What went wrong on the server, shown in the footer. */
  error: string | null;
  onSubmit: (input: CreateSessionInput, kind: string) => void | Promise<void>;
  /** Before the summary in the footer: the edit page's Delete draft. */
  footerStart?: ReactNode;
  /**
   * Saving a draft rather than creating a session: its questions may run to
   * the old, longer limit, so a draft written before the limit came down
   * still saves (`updateSessionSchema`).
   */
  editingDraft?: boolean;
  /** Told whenever leaving would, or would no longer, lose something the leader wrote. */
  onUnsavedWorkChange?: (unsaved: boolean) => void;
  /**
   * Where to keep the unwritten form in this browser while it is being
   * written (`setupAutosave`), and to offer it back from. None: kept nowhere.
   */
  autosaveKey?: string | null;
}

const DISCUSSION_PRESETS = [0, 2 * 60, 5 * 60, 10 * 60, 15 * 60] as const;
const VOTING_PRESETS = [0, 60, 2 * 60, 3 * 60, 5 * 60] as const;

/** How long Undo stays offered after a template replaces the leader's work. */
const UNDO_MS = 6000;

/** How long a note about a paste stays up. */
const PASTE_NOTICE_MS = 6000;

/** How many arriving questions slide in one after another; the rest come with the last. */
const CASCADE_STEPS = 6;

/**
 * What to say after a paste, when there is something the leader would not
 * otherwise see: lines that did not fit, or lines too long to send. Nothing
 * for a paste that simply worked.
 */
export function pasteNoticeText(added: number, dropped: number, long: number): string | null {
  if (dropped === 0 && long === 0) return null;
  const parts = [`Added ${added} ${added === 1 ? 'question' : 'questions'}.`];
  if (dropped > 0) {
    parts.push(`${dropped} more didn’t fit: a session holds up to ${SESSION_QUESTION_LIMIT}.`);
  }
  if (long > 0) {
    parts.push(
      `${long === 1 ? '1 is' : `${long} are`} over ${SESSION_QUESTION_TEXT_MAX} characters: shorten ${long === 1 ? 'it' : 'them'} before sending.`,
    );
  }
  return parts.join(' ');
}

/** A question to put the caret in once the render that brings it has landed. */
type FocusRequest = { key: string; caret: 'end' | [number, number] };

/** One numbered step of the page, as a quiet panel. */
/** The page's one column, which the footer lines up with too. */
const COLUMN = 'mx-auto w-full max-w-[880px] px-4 sm:px-6';

/** Over the title and the template cards. */
const EYEBROW = 'text-[11px] font-bold tracking-[0.1em] text-rt-ink-muted uppercase';

function Step({
  number,
  title,
  aside,
  children,
}: {
  number: number;
  title: string;
  aside?: ReactNode;
  children: ReactNode;
}) {
  const id = `setup-step-${number}`;
  // A plain white card on the white page, edged in grey: the dashboard's and
  // settings' cards. Its order is the page's, so it carries no number.
  return (
    <section
      aria-labelledby={id}
      className="rounded-2xl border border-rt-tertiary/70 bg-rt-surface p-4 sm:p-6"
    >
      <div className="mb-4 flex min-h-6 items-center gap-2.5">
        <h2 id={id} className="text-[16px] font-semibold tracking-[-0.01em] text-rt-ink">
          {title}
        </h2>
        {aside ? (
          <span className="ml-auto inline-flex items-center gap-1.5 text-[11.5px] text-rt-ink-faint">
            {aside}
          </span>
        ) : null}
      </div>
      {children}
    </section>
  );
}

/**
 * The session setup page's body, shared by F04 (create) and F05 (edit a
 * draft): the title, the template cards, then three numbered steps (the
 * questions, their timing, the call), over a footer that always says what is
 * about to be opened and holds the buttons. The shape is identical for both
 * pages (`createSessionSchema` doubles as `updateSessionSchema`, see
 * packages/shared/src/schemas.ts); the caller decides what the buttons do.
 *
 * Order here is exactly the order the server assigns as `position`, so
 * dragging a question by its handle (or Alt+↑/↓ from its text) is the whole UI
 * for it. Each question carries its own vote choice (F41) and a key, so both
 * travel with the text when it moves.
 *
 * The keyboard writes an agenda without the mouse: Enter goes from the title
 * to the first question and from a question to the next (adding one at the
 * end), Backspace in an empty question removes it, and Ctrl/⌘+Enter presses
 * the primary button. A pasted list becomes one question per line.
 */
export function SessionQuestionsForm({
  initialTitle,
  initialQuestions,
  initialDiscussionTimerSeconds,
  initialVotingTimerSeconds,
  initialVoiceEnabled,
  initialTemplate,
  templates,
  actions,
  busy,
  error,
  onSubmit,
  footerStart,
  editingDraft = false,
  onUnsavedWorkChange,
  autosaveKey = null,
}: SessionQuestionsFormProps) {
  const form = useSessionSetupForm({
    title: initialTitle,
    questions: initialQuestions,
    discussionTimerSeconds: initialDiscussionTimerSeconds,
    votingTimerSeconds: initialVotingTimerSeconds,
    voiceEnabled: initialVoiceEnabled,
    template: initialTemplate,
  });
  const { state } = form;
  const [validationError, setValidationError] = useState<string | null>(null);
  // Questions that slide in as they arrive (from a template, an undo, a
  // paste or Enter), each with its place in the cascade.
  const [entering, setEntering] = useState<ReadonlyMap<string, number>>(new Map());
  const [undo, setUndo] = useState<{ name: string; before: SetupFormState } | null>(null);
  // What the last paste left out or ran long, while it is worth saying.
  const [pasteNotice, setPasteNotice] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const inputs = useRef(new Map<string, HTMLInputElement>());
  const focusRequest = useRef<FocusRequest | null>(null);
  // Drag handles, and one to put focus back on once the render that moved its
  // row has landed: moving a focused row in the page can drop its focus.
  const handles = useRef(new Map<string, HTMLButtonElement>());
  const handleFocusRequest = useRef<string | null>(null);
  const titleRequest = useRef<'select' | 'end' | null>(null);
  const drag = useDragReorder({
    attribute: 'data-question-key',
    ids: state.questions.map((q) => q.key),
    onMove: form.moveQuestion,
  });
  const primary = actions.find((action) => action.primary) ?? actions[actions.length - 1];

  // A message about what was wrong goes once anything changes (B8).
  useEffect(() => {
    setValidationError(null);
  }, [state]);

  useEffect(() => {
    onUnsavedWorkChange?.(form.hasUnsavedWork);
  }, [form.hasUnsavedWork, onUnsavedWorkChange]);

  // The form as kept in this browser, and one kept from last time on offer.
  const autosave = useSetupAutosave({
    key: autosaveKey,
    state,
    hasUnsavedWork: form.hasUnsavedWork,
  });
  const { kept } = autosave;

  useEffect(() => {
    if (!undo) return;
    const timer = window.setTimeout(() => setUndo(null), UNDO_MS);
    return () => window.clearTimeout(timer);
  }, [undo]);

  useEffect(() => {
    if (!pasteNotice) return;
    const timer = window.setTimeout(() => setPasteNotice(null), PASTE_NOTICE_MS);
    return () => window.clearTimeout(timer);
  }, [pasteNotice]);

  useLayoutEffect(() => {
    const title = titleRequest.current;
    titleRequest.current = null;
    if (title && titleRef.current) {
      const input = titleRef.current;
      input.focus();
      if (title === 'select') input.select();
      else input.setSelectionRange(input.value.length, input.value.length);
      // The title has just been filled in for them: show where.
      if (closingFades() && typeof input.animate === 'function') {
        input.animate(
          [{ backgroundColor: 'rgb(241 200 129 / 0.45)' }, { backgroundColor: '#ffffff' }],
          { duration: 900, easing: 'ease-out' },
        );
      }
    }
    const handleKey = handleFocusRequest.current;
    handleFocusRequest.current = null;
    if (handleKey) handles.current.get(handleKey)?.focus();
    const request = focusRequest.current;
    if (!request) return;
    focusRequest.current = null;
    const input = inputs.current.get(request.key);
    if (!input) return;
    input.focus();
    const [start, end] =
      request.caret === 'end' ? [input.value.length, input.value.length] : request.caret;
    input.setSelectionRange(start, end);
    input.scrollIntoView?.({ block: 'nearest' });
  });

  /**
   * Slides these questions in, one after another. Only the latest arrivals are
   * held: rows that came earlier have long since landed, and dropping their
   * class does not replay anything.
   */
  function cascade(keys: string[]) {
    // A long paste arrives together after the first few: one by one, the
    // last of 25 would still be hidden two seconds on.
    setEntering(new Map(keys.map((key, index) => [key, Math.min(index, CASCADE_STEPS)])));
  }

  /** Into a question already on the page, at the end of its text. */
  function focusQuestion(key: string | null | undefined) {
    const input = key ? inputs.current.get(key) : undefined;
    if (!input) return;
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
  }

  function pickTemplate(template: SessionTemplate) {
    const replacing = form.hasUnsavedWork;
    const { before, keys } = form.applyTemplate(template);
    cascade(keys);
    // A starter title is selected, so typing replaces it.
    titleRequest.current = template.title ? 'select' : 'end';
    // Only work the leader wrote is worth an Undo; an untouched form just fills.
    setUndo(replacing ? { name: template.name, before } : null);
  }

  function undoTemplate() {
    if (!undo) return;
    form.restore(undo.before);
    cascade(undo.before.questions.map((q) => q.key));
    titleRequest.current = 'end';
    setUndo(null);
  }

  function onQuestionKeyDown(event: KeyboardEvent<HTMLInputElement>, key: string, index: number) {
    if (event.ctrlKey || event.metaKey) return;
    const input = event.currentTarget;
    if (event.key === 'Enter') {
      // Never the whole form (B2): on to the next question, or a new one.
      event.preventDefault();
      const next = state.questions[index + 1];
      if (next && next.text.trim() === '') {
        focusQuestion(next.key);
      } else if (input.value.trim() !== '') {
        const added = form.addQuestion(key);
        if (added) {
          cascade([added]);
          focusRequest.current = { key: added, caret: 'end' };
        } else if (next) focusQuestion(next.key);
      }
    } else if (event.key === 'Backspace' && input.value === '' && state.questions.length > 1) {
      event.preventDefault();
      const neighbour = form.removeQuestion(key);
      if (neighbour) focusRequest.current = { key: neighbour, caret: 'end' };
    } else if (event.altKey && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
      event.preventDefault();
      const to = index + (event.key === 'ArrowUp' ? -1 : 1);
      if (to < 0 || to >= state.questions.length) return;
      focusRequest.current = {
        key,
        caret: [input.selectionStart ?? 0, input.selectionEnd ?? 0],
      };
      form.moveQuestion(key, to);
    }
  }

  function onQuestionPaste(event: ClipboardEvent<HTMLInputElement>, key: string) {
    const lines = splitPastedLines(event.clipboardData.getData('text/plain'));
    if (!lines) return;
    event.preventDefault();
    const { keys, dropped, long } = form.pasteLines(key, lines);
    cascade(keys.filter((k) => k !== key));
    const last = keys[keys.length - 1];
    if (last) focusRequest.current = { key: last, caret: 'end' };
    // A draft takes questions past the limit (see `updateSessionSchema`), so
    // long lines are only worth a word on a new session.
    setPasteNotice(pasteNoticeText(keys.length, dropped, editingDraft ? 0 : long));
  }

  function onFormKeyDown(event: KeyboardEvent<HTMLFormElement>) {
    if (event.key !== 'Enter' || !(event.target instanceof HTMLInputElement)) return;
    event.preventDefault();
    if (event.ctrlKey || event.metaKey) formRef.current?.requestSubmit();
  }

  async function submit(kind: string) {
    // Incomplete forms never submit: the buttons are disabled, and this
    // catches Ctrl+Enter. No zod toast: those messages are what this gate
    // exists to avoid.
    if (form.notReady || busy) return;
    setValidationError(null);
    const result = setupFormInput(state, editingDraft);
    if (!result.ok) {
      setValidationError(result.message);
      return;
    }
    // Gone to the server: nothing more is kept for it.
    autosave.markSent(state);
    await onSubmit(result.input, kind);
  }

  function pickUpKept() {
    const taken = autosave.take();
    if (!taken) return;
    cascade(form.resume(taken.state));
    titleRequest.current = 'end';
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (primary) void submit(primary.kind);
  }

  const atLimit = !form.canAddQuestion;
  const writtenCount = state.questions.filter((q) => q.text.trim().length > 0).length;
  const problem = validationError ?? error;

  return (
    <form
      ref={formRef}
      onSubmit={handleSubmit}
      onKeyDown={onFormKeyDown}
      className="flex min-h-0 flex-1 flex-col"
    >
      {/* `relative`, so what is placed absolutely inside (the screen-reader-only
          labels) is placed in here and scrolls with it, rather than against the
          page, where it would stretch the page past the footer. */}
      <div className="relative min-h-0 flex-1 overflow-y-auto">
        <div className={`${COLUMN} flex flex-col gap-5 pt-6 pb-10 sm:pt-8`}>
          {kept ? (
            <div
              role="region"
              aria-label="Pick up where you left off"
              className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-rt-secondary/45 bg-white px-3 py-2.5 text-[12.5px] text-rt-ink-muted shadow-[0_4px_14px_rgba(122,106,76,0.08)]"
            >
              <History aria-hidden size={15} className="shrink-0 text-rt-secondary-deep" />
              <span className="min-w-0 flex-1">
                You were setting up{' '}
                <b className="font-semibold text-rt-ink">
                  {kept.state.title.trim() ? `“${kept.state.title.trim()}”` : 'a session'}
                </b>{' '}
                {savedAgo(kept.savedAt)}.
              </span>
              <span className="flex gap-1.5">
                <button
                  type="button"
                  onClick={pickUpKept}
                  className="h-8 rounded-full bg-rt-secondary px-3.5 text-[12.5px] font-semibold text-rt-ink hover:bg-rt-secondary-deep hover:text-white focus-visible:ring-2 focus-visible:ring-rt-secondary focus-visible:ring-offset-2 focus-visible:outline-none"
                >
                  Pick up where you left off
                </button>
                <button
                  type="button"
                  onClick={autosave.discard}
                  className="h-8 rounded-full px-3 text-[12.5px] font-semibold text-rt-ink-muted hover:bg-rt-ink/[0.06] hover:text-rt-ink focus-visible:ring-2 focus-visible:ring-rt-secondary focus-visible:outline-none"
                >
                  Start fresh
                </button>
              </span>
            </div>
          ) : null}
          <div className="flex flex-col gap-2.5">
            <label htmlFor="session-title" className={EYEBROW}>
              Session title
            </label>
            <input
              ref={titleRef}
              autoComplete="off"
              id="session-title"
              type="text"
              value={state.title}
              onChange={(e) => form.setTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey)
                  focusQuestion(state.questions[0]?.key);
              }}
              placeholder={state.titlePlaceholder}
              maxLength={120}
              className="h-[52px] w-full rounded-xl border border-rt-tertiary bg-white px-4 text-[17px] font-semibold tracking-[-0.01em] text-rt-ink transition-[border-color,box-shadow] outline-none placeholder:font-medium placeholder:text-rt-ink-faint focus:border-rt-secondary focus:shadow-[0_0_0_3px_rgba(224,163,60,0.28)]"
            />
          </div>

          {templates && templates.length > 0 ? (
            <div className="flex flex-col gap-2">
              <span className={EYEBROW}>Start from</span>
              <TemplateCards
                templates={templates}
                selectedId={state.templateId}
                onPick={pickTemplate}
              />
            </div>
          ) : null}

          <Step
            number={1}
            title="Questions"
            aside={
              <>
                <GripVertical aria-hidden size={13} />
                Drag to reorder
              </>
            }
          >
            <ol className="flex flex-col gap-2" aria-label="Questions, in order">
              {state.questions.map((question, index) => {
                const shown = drag.previewOrder ? drag.previewOrder.indexOf(question.key) : index;
                return (
                  <QuestionRow
                    key={question.key}
                    question={question}
                    number={shown + 1}
                    maxLength={SESSION_QUESTION_TEXT_MAX}
                    acceptsLonger={editingDraft}
                    lifted={drag.draggingId === question.key}
                    entering={entering.get(question.key) ?? null}
                    style={drag.rowStyle(question.key)}
                    handle={drag.handleProps(question.key)}
                    canRemove={state.questions.length > 1}
                    inputRef={(element) => {
                      if (element) inputs.current.set(question.key, element);
                      else inputs.current.delete(question.key);
                    }}
                    handleRef={(element) => {
                      if (element) handles.current.set(question.key, element);
                      else handles.current.delete(question.key);
                    }}
                    onText={(text) => form.setQuestionText(question.key, text)}
                    onVoting={(votingEnabled) =>
                      form.setQuestionVoting(question.key, votingEnabled)
                    }
                    onRemove={() => form.removeQuestion(question.key)}
                    onKeyDown={(event) => onQuestionKeyDown(event, question.key, index)}
                    onHandleKeyDown={(event) => {
                      if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
                      event.preventDefault();
                      handleFocusRequest.current = question.key;
                      form.moveQuestion(question.key, index + (event.key === 'ArrowUp' ? -1 : 1));
                    }}
                    onPaste={(event) => onQuestionPaste(event, question.key)}
                  />
                );
              })}
            </ol>
            <div className="mt-2.5 flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
              <button
                type="button"
                disabled={atLimit}
                onClick={() => {
                  const key = form.addQuestion();
                  if (!key) return;
                  cascade([key]);
                  focusRequest.current = { key, caret: 'end' };
                }}
                className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-full border border-dashed border-rt-tertiary px-4 text-[13px] font-semibold text-rt-ink transition-colors hover:border-solid hover:border-rt-secondary hover:bg-rt-secondary-wash focus-visible:ring-2 focus-visible:ring-rt-secondary focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-45"
              >
                <span aria-hidden>+</span> Add question
              </button>
              {/* A status, so what a paste left out, or the limit, is heard as
                  well as seen; the plain hint does not change, so is not read. */}
              <span
                role="status"
                className={`min-w-[120px] flex-1 text-[11.5px] leading-snug ${
                  pasteNotice ? 'font-medium text-rt-secondary-deep' : 'text-rt-ink-faint'
                }`}
              >
                {pasteNotice ??
                  (atLimit
                    ? `That’s the most one session can hold (${SESSION_QUESTION_LIMIT}).`
                    : 'Enter adds the next one · Alt+↑/↓ moves one · paste a list to split it')}
              </span>
              <span className="text-[11.5px] text-rt-ink-faint tabular-nums">
                {state.questions.length >= SESSION_QUESTION_LIMIT - 10
                  ? `${state.questions.length} of ${SESSION_QUESTION_LIMIT}`
                  : `${writtenCount} ${writtenCount === 1 ? 'question' : 'questions'}`}
              </span>
            </div>
          </Step>

          <Step number={2} title="Timing" aside="Optional">
            <div className="grid gap-[18px] sm:grid-cols-2">
              <TimerPresets
                id="discussion-timer"
                label="Discussion"
                info="Starts when discussion begins, and everyone can see it. It does not end the phase: it turns red if you run over."
                hint="Per question. Never cuts anyone off."
                presets={DISCUSSION_PRESETS}
                maxSeconds={DISCUSSION_TIMER_MAX_SECONDS}
                value={state.discussionTimerSeconds}
                onChange={(seconds) => form.setTimer('discussion', seconds)}
              />
              <TimerPresets
                id="voting-timer"
                label="Voting"
                info="Starts when the ballot opens, on questions that go to a vote. At zero, voting ends and everyone sees the result; the leader then carries on."
                hint="Per vote. Closes the ballot at zero."
                presets={VOTING_PRESETS}
                maxSeconds={VOTING_TIMER_MAX_SECONDS}
                value={state.votingTimerSeconds}
                onChange={(seconds) => form.setTimer('voting', seconds)}
              />
            </div>
          </Step>

          <Step
            number={3}
            title="Call"
            aside={
              <>
                <Lock aria-hidden size={12} />
                Locked once the room opens
              </>
            }
          >
            <CallChoice voiceEnabled={state.voiceEnabled} onChange={form.setVoiceEnabled} />
          </Step>
        </div>
      </div>

      {/* White, edged above, and lined up with the column the cards are in. */}
      <footer className="relative z-20 shrink-0 border-t border-rt-tertiary/70 bg-rt-surface/95 backdrop-blur-md">
        <div className={`${COLUMN} flex flex-wrap items-center gap-x-2.5 gap-y-2 py-2.5 sm:py-3`}>
          {footerStart}
          <FactLine facts={sessionFacts(state)} className="basis-full sm:basis-auto" />
          <span aria-hidden className="hidden flex-1 sm:block" />
          {problem ? (
            <p role="alert" className="basis-full text-[12.5px] text-red-700 sm:basis-auto">
              {problem}
            </p>
          ) : form.notReady ? (
            <p
              id="setup-not-ready"
              className="hidden text-[12px] whitespace-nowrap text-rt-ink-faint sm:block"
            >
              {form.notReady}
            </p>
          ) : null}
          {actions.map((action) => {
            const isBusy = busy === action.kind;
            return (
              <button
                key={action.kind}
                type="button"
                disabled={!!form.notReady || busy !== null}
                // The shortcut is said on hover, not drawn on the button: most
                // people never use it, and the badge only crowded the label.
                title={
                  form.notReady ?? (action.primary ? `${action.label} (Ctrl+Enter)` : undefined)
                }
                onClick={() => void submit(action.kind)}
                className={`inline-flex h-11 flex-1 cursor-pointer items-center justify-center gap-2 rounded-full px-5 text-[14px] font-semibold whitespace-nowrap transition-[background-color,color,box-shadow] focus-visible:ring-2 focus-visible:ring-rt-secondary focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-not-allowed sm:flex-none ${
                  action.primary
                    ? 'bg-rt-secondary text-rt-ink shadow-[0_1px_0_rgba(122,106,76,0.25),0_6px_16px_rgba(224,163,60,0.28)] hover:enabled:bg-rt-secondary-deep hover:enabled:text-white disabled:opacity-45 disabled:shadow-none'
                    : 'border border-rt-tertiary bg-white text-rt-ink hover:enabled:bg-rt-surface-alt disabled:opacity-45'
                }`}
              >
                {action.icon}
                {isBusy ? action.busyLabel : action.label}
              </button>
            );
          })}
        </div>
      </footer>

      {undo ? (
        <div
          role="status"
          className="fixed bottom-24 left-1/2 z-40 flex -translate-x-1/2 items-center gap-2.5 rounded-full bg-rt-ink py-[7px] pr-[7px] pl-3.5 text-[12.5px] whitespace-nowrap text-white shadow-[0_10px_30px_rgba(0,0,0,0.25)] motion-safe:animate-[rt-toast-in_220ms_ease-out]"
        >
          Applied {undo.name}
          <button
            type="button"
            onClick={undoTemplate}
            className="inline-flex h-[26px] items-center gap-[5px] rounded-full bg-white/15 px-2.5 text-[12px] font-semibold hover:bg-white/25 focus-visible:ring-2 focus-visible:ring-white focus-visible:outline-none"
          >
            <Undo2 aria-hidden size={13} />
            Undo
          </button>
        </div>
      ) : null}
    </form>
  );
}
