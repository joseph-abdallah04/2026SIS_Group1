import { DoorOpen } from 'lucide-react';
import { useState } from 'react';

import { SessionQuestionsForm, type SetupAction } from './SessionQuestionsForm';
import type { SessionTemplate } from './templates';
import { useCreateSession } from './useCreateSession';

/** A session "Open the room" made: open, or kept as a draft that would not open. */
export interface OpenedSession {
  sessionId: string;
  title: string;
  code: string | null;
  openError?: string;
}

interface CreateSessionFormProps {
  templates: readonly SessionTemplate[];
  /** Start filled in from this template. */
  initialTemplate?: SessionTemplate | null;
  onUnsavedWorkChange?: (unsaved: boolean) => void;
  /** Where this browser keeps the form while it is written (`setupAutosave`). */
  autosaveKey?: string | null;
  /** Saved as a draft: off to its draft page. */
  onSaved: (sessionId: string) => void;
  /**
   * Created and opened, with its title and join code: off to the waiting room.
   * If it was made but would not open, `openError` says why.
   */
  onOpened: (opened: OpenedSession) => void;
}

/** F2: the draft for later, or the room now (the primary, and Ctrl/⌘+Enter). */
const ACTIONS: SetupAction[] = [
  { kind: 'draft', label: 'Save as draft', busyLabel: 'Saving…' },
  {
    kind: 'open',
    label: 'Open the room',
    busyLabel: 'Opening…',
    primary: true,
    icon: <DoorOpen aria-hidden size={16} />,
  },
];

/** F04: a new session. See `SessionQuestionsForm` for the shared editor. */
export function CreateSessionForm({
  templates,
  initialTemplate,
  onUnsavedWorkChange,
  autosaveKey,
  onSaved,
  onOpened,
}: CreateSessionFormProps) {
  const { create, createAndOpen, error } = useCreateSession();
  const [busy, setBusy] = useState<string | null>(null);

  return (
    <SessionQuestionsForm
      templates={templates}
      initialTemplate={initialTemplate}
      onUnsavedWorkChange={onUnsavedWorkChange}
      autosaveKey={autosaveKey}
      actions={ACTIONS}
      busy={busy}
      error={error}
      onSubmit={async (input, kind) => {
        setBusy(kind);
        if (kind === 'open') {
          const result = await createAndOpen(input);
          setBusy(null);
          if (!result) return;
          onOpened(
            result.opened
              ? { sessionId: result.sessionId, title: input.title, code: result.code }
              : {
                  sessionId: result.sessionId,
                  title: input.title,
                  code: null,
                  openError: result.openError,
                },
          );
          return;
        }
        const session = await create(input);
        setBusy(null);
        if (session) onSaved(session.id);
      }}
    />
  );
}
