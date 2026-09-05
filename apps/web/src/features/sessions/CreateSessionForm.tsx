import { SessionQuestionsForm } from './SessionQuestionsForm';
import { useCreateSession } from './useCreateSession';

interface CreateSessionFormProps {
  onCreated: (sessionId: string) => void;
  onCancel: () => void;
}

/** F04: creates a new draft. See `SessionQuestionsForm` for the shared editor. */
export function CreateSessionForm({ onCreated, onCancel }: CreateSessionFormProps) {
  const { create, submitting, error } = useCreateSession();

  return (
    <SessionQuestionsForm
      submitLabel="Create session"
      submittingLabel="Creating…"
      submitting={submitting}
      error={error}
      onSubmit={async (input) => {
        const session = await create(input);
        if (session) onCreated(session.id);
      }}
      extraActions={
        <button
          type="button"
          onClick={onCancel}
          className="text-[13px] font-semibold text-rt-ink-muted hover:text-rt-ink hover:underline"
        >
          Cancel
        </button>
      }
    />
  );
}
