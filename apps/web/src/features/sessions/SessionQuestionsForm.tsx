import { useState, type FormEvent } from 'react';
import { createSessionSchema, type CreateSessionInput } from '@roundtable/shared/schemas';

import { Button } from '../../components/ui/Button';

interface SessionQuestionsFormProps {
  initialTitle?: string;
  initialQuestions?: string[];
  submitLabel: string;
  submittingLabel: string;
  submitting: boolean;
  error: string | null;
  onSubmit: (input: CreateSessionInput) => void | Promise<void>;
  /** Rendered after the submit button — F05's Delete, or create-page Cancel. */
  extraActions?: React.ReactNode;
}

/**
 * The title + ordered-questions editor shared by F04 (create) and F05 (edit
 * a draft) — the shape is identical (`createSessionSchema` doubles as
 * `updateSessionSchema`, see packages/shared/src/schemas.ts), so this is one
 * component with the persistence decided by the caller's `onSubmit`, not two
 * near-duplicates. Order here is exactly the order the server assigns as
 * `position` — no separate reorder step, so moving a row up/down before
 * submitting is the whole UI for it.
 */
export function SessionQuestionsForm({
  initialTitle = '',
  initialQuestions = [''],
  submitLabel,
  submittingLabel,
  submitting,
  error,
  onSubmit,
  extraActions,
}: SessionQuestionsFormProps) {
  const [title, setTitle] = useState(initialTitle);
  const [questions, setQuestions] = useState<string[]>(
    initialQuestions.length > 0 ? initialQuestions : [''],
  );
  const [validationError, setValidationError] = useState<string | null>(null);

  const ready = title.trim().length > 0 && questions.some((question) => question.trim().length > 0);

  function updateQuestion(index: number, text: string) {
    setQuestions((prev) => prev.map((q, i) => (i === index ? text : q)));
  }

  function addQuestion() {
    setQuestions((prev) => [...prev, '']);
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

    const parsed = createSessionSchema.safeParse({
      title,
      questions: questions.map((q) => q.trim()).filter((q) => q.length > 0),
    });
    if (!parsed.success) {
      setValidationError(parsed.error.issues[0]?.message ?? 'Invalid session');
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
          id="session-title"
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="What is this session about?"
          maxLength={120}
          className="min-h-10 rounded-lg border border-rt-tertiary bg-rt-surface px-3 text-[13px] text-rt-ink outline-none focus-visible:ring-2 focus-visible:ring-rt-secondary"
        />
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-[13px] font-semibold text-rt-ink">Questions (in order)</span>
        <div className="flex flex-col gap-2">
          {questions.map((question, index) => (
            <div key={index} className="flex items-center gap-2">
              <span className="w-5 shrink-0 text-[12px] font-semibold text-rt-ink-faint">
                {index + 1}.
              </span>
              <input
                type="text"
                value={question}
                onChange={(e) => updateQuestion(index, e.target.value)}
                placeholder={`Question ${index + 1}`}
                maxLength={500}
                className="min-h-10 flex-1 rounded-lg border border-rt-tertiary bg-rt-surface px-3 text-[13px] text-rt-ink outline-none focus-visible:ring-2 focus-visible:ring-rt-secondary"
              />
              <button
                type="button"
                onClick={() => moveQuestion(index, -1)}
                disabled={index === 0}
                aria-label="Move question up"
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-rt-ink-muted hover:bg-rt-primary-tint disabled:opacity-30"
              >
                ↑
              </button>
              <button
                type="button"
                onClick={() => moveQuestion(index, 1)}
                disabled={index === questions.length - 1}
                aria-label="Move question down"
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-rt-ink-muted hover:bg-rt-primary-tint disabled:opacity-30"
              >
                ↓
              </button>
              <button
                type="button"
                onClick={() => removeQuestion(index)}
                disabled={questions.length === 1}
                aria-label="Remove question"
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-rt-ink-muted hover:bg-rt-primary-tint disabled:opacity-30"
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
