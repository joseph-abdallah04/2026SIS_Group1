import { GripVertical, History, Undo2 } from 'lucide-react';
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
import {
  clearSetup,
  readSetup,
  savedAgo,
  writeSetup,
  type SavedSetup,
} from './setup/setupAutosave';
import { QuestionRow } from './setup/QuestionRow';
import { summaryParts } from './setup/setupSummary';
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

/** How long after the last change the form is kept. */
const AUTOSAVE_MS = 400;

const DISCUSSION_PRESETS = [0, 2 * 60, 5 * 60, 10 * 60, 15 * 60] as const;
const VOTING_PRESETS = [0, 60, 2 * 60, 3 * 60, 5 * 60] as const;

/** How long Undo stays offered after a template replaces the leader's work. */
const UNDO_MS = 6000;

/** A question to put the caret in once the render that brings it has landed. */
type FocusRequest = { key: string; caret: 'end' | [number, number] };

/** One numbered step of the page, as a quiet panel. */
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
  return (
    <section
      aria-labelledby={id}
      className="rounded-2xl border border-rt-secondary/30 bg-[#fffcf6]/95 p-3.5 shadow-[0_8px_24px_rgba(122,106,76,0.07)] sm:p-[18px]"
    >
      <div className="mb-3 flex min-h-6 items-center gap-2.5">
        <span
          aria-hidden
          className="flex size-[22px] shrink-0 items-center justify-center rounded-full border border-rt-secondary/55 bg-rt-secondary-wash text-[11px] font-bold text-rt-secondary-deep"
        >
          {number}
        </span>
        <h2 id={id} className="text-[13.5px] font-semibold tracking-[-0.005em] text-rt-ink">
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
  const formRef = useRef<HTMLFormElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const inputs = useRef(new Map<string, HTMLInputElement>());
  const focusRequest = useRef<FocusRequest | null>(null);
  const titleRequest = useRef<'select' | 'end' | null>(null);
  const drag = useDragReorder({ attribute: 'data-question-key', onMove: form.moveQuestion });
  const primary = actions.find((action) => action.primary) ?? actions[actions.length - 1];

  // A message about what was wrong goes once anything changes (B8).
  useEffect(() => {
    setValidationError(null);
  }, [state]);

  useEffect(() => {
    onUnsavedWorkChange?.(form.hasUnsavedWork);
  }, [form.hasUnsavedWork, onUnsavedWorkChange]);

  // A form kept from last time, offered back until the leader answers.
  const [kept, setKept] = useState<SavedSetup | null>(() =>
    autosaveKey ? readSetup(autosaveKey) : null,
  );
  // The state that was sent: nothing is kept for it, so a form that has gone
  // to the server is not offered back. The next change keeps it again.
  const sentState = useRef<SetupFormState | null>(null);
  const { hasUnsavedWork } = form;
  useEffect(() => {
    // Writing now would overwrite the one on offer.
    if (!autosaveKey || kept || sentState.current === state) return;
    const timer = window.setTimeout(() => {
      if (hasUnsavedWork) writeSetup(autosaveKey, state);
      else clearSetup(autosaveKey);
    }, AUTOSAVE_MS);
    return () => window.clearTimeout(timer);
  }, [autosaveKey, kept, state, hasUnsavedWork]);

  useEffect(() => {
    if (!undo) return;
    const timer = window.setTimeout(() => setUndo(null), UNDO_MS);
    return () => window.clearTimeout(timer);
  }, [undo]);

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

  /** Slides these questions in, one after another. */
  function cascade(keys: string[]) {
    setEntering((current) => {
      const next = new Map(current);
      keys.forEach((key, index) => next.set(key, index));
      return next;
    });
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
    const keys = form.pasteLines(key, lines);
    cascade(keys.filter((k) => k !== key));
    const last = keys[keys.length - 1];
    if (last) focusRequest.current = { key: last, caret: 'end' };
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
    sentState.current = state;
    await onSubmit(result.input, kind);
  }

  function pickUpKept() {
    if (!kept) return;
    cascade(form.resume(kept.state));
    titleRequest.current = 'end';
    setKept(null);
  }

  function startFresh() {
    clearSetup(autosaveKey);
    setKept(null);
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (primary) void submit(primary.kind);
  }

  const atLimit = !form.canAddQuestion;
  const writtenCount = state.questions.filter((q) => q.text.trim().length > 0).length;
  const [questionsFact, ...restFacts] = summaryParts(state);
  const problem = validationError ?? error;

  return (
    <form
      ref={formRef}
      onSubmit={handleSubmit}
      onKeyDown={onFormKeyDown}
      className="flex min-h-0 flex-1 flex-col"
    >
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-[700px] flex-col gap-4 px-4 pt-6 pb-10 sm:px-6 sm:pt-7">
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
                  onClick={startFresh}
                  className="h-8 rounded-full px-3 text-[12.5px] font-semibold text-rt-ink-muted hover:bg-rt-ink/[0.06] hover:text-rt-ink focus-visible:ring-2 focus-visible:ring-rt-secondary focus-visible:outline-none"
                >
                  Start fresh
                </button>
              </span>
            </div>
          ) : null}
          <div className="flex flex-col gap-2.5">
            <label
              htmlFor="session-title"
              className="text-[11px] font-bold tracking-[0.1em] text-rt-secondary-deep uppercase"
            >
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
              className="h-12 w-full rounded-xl border border-[#e6dccb] bg-white px-3.5 text-[17px] font-semibold tracking-[-0.01em] text-rt-ink transition-[border-color,box-shadow] outline-none placeholder:font-medium placeholder:text-[#aaa59b] focus:border-rt-secondary focus:shadow-[0_0_0_3px_rgba(224,163,60,0.28)]"
            />
          </div>

          {templates && templates.length > 0 ? (
            <div className="flex flex-col gap-2">
              <span className="text-[11px] font-bold tracking-[0.1em] text-rt-secondary-deep uppercase">
                Start from
              </span>
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
                    lifted={drag.draggingId === question.key}
                    entering={entering.get(question.key) ?? null}
                    style={drag.rowStyle(question.key)}
                    handle={drag.handleProps(question.key)}
                    canRemove={state.questions.length > 1}
                    inputRef={(element) => {
                      if (element) inputs.current.set(question.key, element);
                      else inputs.current.delete(question.key);
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
                className="inline-flex h-[34px] items-center gap-1.5 rounded-full border border-dashed border-[#d8cbb2] px-[13px] text-[12.5px] font-semibold text-rt-secondary-deep transition-colors hover:border-solid hover:border-rt-secondary hover:bg-rt-secondary-wash focus-visible:ring-2 focus-visible:ring-rt-secondary focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-45"
              >
                <span aria-hidden>+</span> Add question
              </button>
              <span className="min-w-[120px] flex-1 text-[11.5px] leading-snug text-rt-ink-faint">
                {atLimit
                  ? `That’s the most one session can hold (${SESSION_QUESTION_LIMIT}).`
                  : 'Enter adds the next one · Alt+↑/↓ moves one · paste a list to split it'}
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

          <Step number={3} title="Call">
            <CallChoice voiceEnabled={state.voiceEnabled} onChange={form.setVoiceEnabled} />
          </Step>
        </div>
      </div>

      <footer className="relative z-20 flex shrink-0 flex-wrap items-center gap-x-2.5 gap-y-2 border-t border-rt-secondary/30 bg-[#fffcf6]/95 px-3 py-2.5 backdrop-blur-md sm:px-5 sm:py-3">
        {footerStart}
        <p className="flex min-w-0 basis-full flex-wrap items-center gap-x-2 text-[12.5px] text-rt-ink-muted sm:basis-auto">
          <span className="font-semibold text-rt-ink">{questionsFact}</span>
          {restFacts.map((fact) => (
            <span key={fact} className="inline-flex items-center gap-2">
              <span aria-hidden className="size-[3px] rounded-full bg-[#c9bfae]" />
              <span className="sr-only">, </span>
              {fact}
            </span>
          ))}
        </p>
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
              title={form.notReady ?? undefined}
              onClick={() => void submit(action.kind)}
              className={`inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-full px-[18px] text-[13.5px] font-semibold whitespace-nowrap transition-[background-color,color,box-shadow] focus-visible:ring-2 focus-visible:ring-rt-secondary focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-not-allowed sm:flex-none ${
                action.primary
                  ? 'bg-rt-secondary text-rt-ink shadow-[0_1px_0_rgba(122,106,76,0.25),0_6px_16px_rgba(224,163,60,0.28)] hover:enabled:bg-rt-secondary-deep hover:enabled:text-white disabled:opacity-45 disabled:shadow-none'
                  : 'border border-rt-tertiary bg-white text-rt-ink hover:enabled:bg-[#f6f2ea] disabled:opacity-45'
              }`}
            >
              {action.icon}
              {isBusy ? action.busyLabel : action.label}
              {action.primary && !isBusy ? (
                <kbd
                  aria-hidden
                  className="hidden rounded-[5px] border border-b-2 border-current px-1 font-sans text-[10.5px] leading-[15px] opacity-55 sm:inline"
                >
                  Ctrl ↵
                </kbd>
              ) : null}
            </button>
          );
        })}
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
