import { useState, type FormEvent } from 'react';
import {
  createSessionSchema,
  DISCUSSION_TIMER_MAX_SECONDS,
  SESSION_QUESTION_TEXT_MAX,
  sessionIssueMessage,
  updateSessionSchema,
  VOTING_TIMER_MAX_SECONDS,
  type CreateSessionInput,
  type SessionQuestionInput,
  type TimerDurationParts,
} from '@roundtable/shared/schemas';

import { Button } from '../../components/ui/Button';
import {
  secondsFromTimerParts,
  TimerDurationFields,
  timerPartsFromSeconds,
} from './TimerDurationFields';
import { VoteToggle } from './VoteToggle';

interface SessionQuestionsFormProps {
  initialTitle?: string;
  initialQuestions?: SessionQuestionInput[];
  initialDiscussionTimerSeconds?: number | null;
  initialVotingTimerSeconds?: number | null;
  /** Live call (true) or no call (false). New sessions start with no call. */
  initialVoiceEnabled?: boolean;
  submitLabel: string;
  submittingLabel: string;
  submitting: boolean;
  error: string | null;
  onSubmit: (input: CreateSessionInput) => void | Promise<void>;
  /** Rendered after the submit button — F05's Delete, or create-page Cancel. */
  extraActions?: React.ReactNode;
  /**
   * Saving a draft rather than creating a session: its questions may run to
   * the old, longer limit, so a draft written before the limit came down
   * still saves (`updateSessionSchema`).
   */
  editingDraft?: boolean;
}

const ZERO_DURATION: TimerDurationParts = { hours: 0, minutes: 0, seconds: 0 };

/** The two answers to "does this session have a call?", in the order shown. */
const CALL_OPTIONS = [
  { voiceEnabled: true, label: 'Live call', hint: 'Talk live while you work the board.' },
  { voiceEnabled: false, label: 'No call', hint: 'Everyone works on the board, with no audio.' },
] as const;

/** A fresh row is a voting question — what every question was before F41. */
function blankQuestion(): SessionQuestionInput {
  return { text: '', votingEnabled: true };
}

/**
 * The title + ordered-questions editor shared by F04 (create) and F05 (edit
 * a draft) — the shape is identical (`createSessionSchema` doubles as
 * `updateSessionSchema`, see packages/shared/src/schemas.ts), so this is one
 * component with the persistence decided by the caller's `onSubmit`, not two
 * near-duplicates. Order here is exactly the order the server assigns as
 * `position` — no separate reorder step, so moving a row up/down before
 * submitting is the whole UI for it. Each row carries its own vote choice
 * (F41), so it travels with the text when the row moves.
 */
export function SessionQuestionsForm({
  initialTitle = '',
  initialQuestions = [blankQuestion()],
  initialDiscussionTimerSeconds = null,
  initialVotingTimerSeconds = null,
  initialVoiceEnabled = false,
  editingDraft = false,
  submitLabel,
  submittingLabel,
  submitting,
  error,
  onSubmit,
  extraActions,
}: SessionQuestionsFormProps) {
  const [title, setTitle] = useState(initialTitle);
  const [questions, setQuestions] = useState<SessionQuestionInput[]>(
    initialQuestions.length > 0 ? initialQuestions : [blankQuestion()],
  );
  const [discussionTimer, setDiscussionTimer] = useState(
    () => timerPartsFromSeconds(initialDiscussionTimerSeconds) ?? ZERO_DURATION,
  );
  const [votingTimer, setVotingTimer] = useState(
    () => timerPartsFromSeconds(initialVotingTimerSeconds) ?? ZERO_DURATION,
  );
  const [voiceEnabled, setVoiceEnabled] = useState(initialVoiceEnabled);
  const [validationError, setValidationError] = useState<string | null>(null);

  const ready =
    title.trim().length > 0 && questions.some((question) => question.text.trim().length > 0);

  function updateQuestion(index: number, text: string) {
    setQuestions((prev) => prev.map((q, i) => (i === index ? { ...q, text } : q)));
  }

  function setQuestionVoting(index: number, votingEnabled: boolean) {
    setQuestions((prev) => prev.map((q, i) => (i === index ? { ...q, votingEnabled } : q)));
  }

  function addQuestion() {
    setQuestions((prev) => [...prev, blankQuestion()]);
  }

  function removeQuestion(index: number) {
    setQuestions((prev) => (prev.length > 1 ? prev.filter((_, i) => i !== index) : prev));
  }

  function moveQuestion(index: number, direction: -1 | 1) {
    setQuestions((prev) => {
      const target = index + direction;
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      const moved = next[index];
      const swapped = next[target];
      if (moved === undefined || swapped === undefined) return prev;
      next[index] = swapped;
      next[target] = moved;
      return next;
    });
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    // Incomplete forms never submit — the button is disabled, and this
    // catches Enter-in-a-field. No zod toast: those messages are what
    // this gate exists to avoid.
    if (!ready || submitting) return;
    setValidationError(null);

    const parsed = (editingDraft ? updateSessionSchema : createSessionSchema).safeParse({
      title,
      questions: questions
        .map((q) => ({ ...q, text: q.text.trim() }))
        .filter((q) => q.text.length > 0),
      discussionTimerSeconds: secondsFromTimerParts(discussionTimer),
      votingTimerSeconds: secondsFromTimerParts(votingTimer),
      voiceEnabled,
    });
    if (!parsed.success) {
      setValidationError(sessionIssueMessage(parsed.error.issues, 'Invalid session'));
      return;
    }

    await onSubmit(parsed.data);
  }

  return (
    <form onSubmit={handleSubmit} className="flex w-full max-w-xl flex-col gap-6">
      <div className="flex flex-col gap-2">
        <label htmlFor="session-title" className="text-[13px] font-semibold text-rt-ink">
          Focus / title
        </label>
        <input
          autoComplete="off"
          id="session-title"
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="What is this session about?"
          maxLength={120}
          className="min-h-10 rounded-full border border-rt-tertiary bg-rt-surface px-3 text-[13px] text-rt-ink outline-none focus-visible:ring-2 focus-visible:ring-rt-secondary"
        />
      </div>

      {/* Radios rather than a toggle: neither answer is "off", and the leader
          should see both before choosing. Styled like `VoteToggle`'s pill. */}
      <fieldset className="flex flex-col gap-2">
        <legend className="text-[13px] font-semibold text-rt-ink">Call</legend>
        <p className="text-[12px] leading-relaxed text-rt-ink-muted">
          You can’t change this once the session is open.
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          {CALL_OPTIONS.map((option) => (
            <label key={option.label} className="cursor-pointer">
              <input
                type="radio"
                name="session-call"
                checked={voiceEnabled === option.voiceEnabled}
                onChange={() => setVoiceEnabled(option.voiceEnabled)}
                className="peer sr-only"
              />
              <span className="flex h-full flex-col gap-0.5 rounded-2xl border border-dashed border-rt-tertiary px-3 py-2 hover:bg-rt-primary-tint peer-checked:border-solid peer-checked:border-rt-secondary peer-checked:bg-rt-secondary-wash peer-focus-visible:ring-2 peer-focus-visible:ring-rt-secondary">
                <span className="text-[13px] font-semibold text-rt-ink">{option.label}</span>
                <span className="text-[12px] text-rt-ink-muted">{option.hint}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="flex flex-col gap-2">
        <span className="text-[13px] font-semibold text-rt-ink">Questions (in order)</span>
        <p className="text-[12px] leading-relaxed text-rt-ink-muted">
          Turn off Vote for a brainstorm-only question: the team adds ideas, and nobody is asked to
          vote.
        </p>
        <div className="flex flex-col gap-2">
          {questions.map((question, index) => (
            <div key={index} className="flex items-center gap-2">
              <span className="w-5 shrink-0 text-[12px] font-semibold text-rt-ink-faint">
                {index + 1}.
              </span>
              <input
                autoComplete="off"
                type="text"
                value={question.text}
                onChange={(e) => updateQuestion(index, e.target.value)}
                placeholder={`Question ${index + 1}`}
                maxLength={SESSION_QUESTION_TEXT_MAX}
                className="min-h-10 min-w-0 flex-1 rounded-full border border-rt-tertiary bg-rt-surface px-3 text-[13px] text-rt-ink outline-none focus-visible:ring-2 focus-visible:ring-rt-secondary"
              />
              <VoteToggle
                votingEnabled={question.votingEnabled}
                onChange={(votingEnabled) => setQuestionVoting(index, votingEnabled)}
                label={`Vote on question ${index + 1}`}
              />
              <button
                type="button"
                onClick={() => moveQuestion(index, -1)}
                disabled={index === 0}
                aria-label="Move question up"
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-rt-ink-muted hover:bg-rt-primary-tint disabled:opacity-30"
              >
                ↑
              </button>
              <button
                type="button"
                onClick={() => moveQuestion(index, 1)}
                disabled={index === questions.length - 1}
                aria-label="Move question down"
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-rt-ink-muted hover:bg-rt-primary-tint disabled:opacity-30"
              >
                ↓
              </button>
              <button
                type="button"
                onClick={() => removeQuestion(index)}
                disabled={questions.length === 1}
                aria-label="Remove question"
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-rt-ink-muted hover:bg-rt-primary-tint disabled:opacity-30"
              >
                ×
              </button>
            </div>
          ))}
        </div>
        <Button type="button" variant="secondary" onClick={addQuestion} className="self-start">
          + Add question
        </Button>
      </div>

      <fieldset className="flex flex-col gap-3">
        <legend className="text-[13px] font-semibold text-rt-ink">Timers (optional)</legend>
        <p className="text-[12px] leading-relaxed text-rt-ink-muted">
          Leave a clock at 0:00:00 to skip it. Neither is required to save a draft or start a
          session. Seconds step in 15s.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <TimerDurationFields
            id="discussion-timer"
            label="Discussion timer"
            maxSeconds={DISCUSSION_TIMER_MAX_SECONDS}
            value={discussionTimer}
            onChange={setDiscussionTimer}
            hint="Starts when discussion begins. Visible to everyone. Does not end the phase; it turns red if you run over."
          />
          <TimerDurationFields
            id="voting-timer"
            label="Voting timer"
            maxSeconds={VOTING_TIMER_MAX_SECONDS}
            value={votingTimer}
            onChange={setVotingTimer}
            hint="Starts when the ballot opens, on questions with Vote on. When it hits zero, voting ends and everyone sees the result. The leader then continues."
          />
        </div>
      </fieldset>

      {(validationError ?? error) && (
        <p className="text-[13px] text-red-600">{validationError ?? error}</p>
      )}

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={submitting || !ready} className="self-start">
          {submitting ? submittingLabel : submitLabel}
        </Button>
        {extraActions}
      </div>
    </form>
  );
}
