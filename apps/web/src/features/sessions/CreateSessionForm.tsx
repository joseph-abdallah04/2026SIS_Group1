import { SessionQuestionsForm } from './SessionQuestionsForm';
import { useCreateSession } from './useCreateSession';

interface CreateSessionFormProps {
  onCreated: (sessionId: string) => void;
}

/** F04: creates a new draft. See `SessionQuestionsForm` for the shared editor. */
export function CreateSessionForm({ onCreated }: CreateSessionFormProps) {
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
    />
  );
}
