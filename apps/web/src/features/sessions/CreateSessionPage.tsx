import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { useCurrentUserId } from '../../lib/currentUser';
import { CreateSessionForm, type OpenedSession } from './CreateSessionForm';
import { RoomSetMoment } from './setup/RoomSetMoment';
import { clearSetup, setupAutosaveKey } from './setup/setupAutosave';
import { SetupHeader } from './setup/SetupHeader';
import { findTemplate, useSessionTemplates } from './templates';

/** What the draft page is handed when "Open the room" made the draft but could not open it. */
export interface DraftPageState {
  openError?: string;
}

export function CreateSessionPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { templates } = useSessionTemplates();
  // `/sessions/new?template=retrospective` opens the form already filled in.
  const [template] = useState(() => findTemplate(templates, params.get('template')));
  const [confirmingLeave, setConfirmingLeave] = useState(false);
  const [unsaved, setUnsaved] = useState(false);
  // The room just opened, while its moment plays.
  const [opened, setOpened] = useState<OpenedSession | null>(null);
  const autosaveKey = setupAutosaveKey(useCurrentUserId());

  // Refresh, close or typing a new address would lose it all without a word.
  // (In-app Back is covered by the copy kept in this browser instead.)
  useEffect(() => {
    if (!unsaved || opened) return;
    function onBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault();
      event.returnValue = '';
    }
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [unsaved, opened]);

  function goToDashboard() {
    navigate('/dashboard');
  }

  /** Asks first only when there is something to lose. */
  function leave() {
    if (unsaved) setConfirmingLeave(true);
    else goToDashboard();
  }

  function toSession(sessionId: string, openError?: string) {
    navigate(`/sessions/${sessionId}`, {
      replace: true,
      state: openError ? ({ openError } satisfies DraftPageState) : undefined,
    });
  }

  return (
    <main className="rt-setup-page flex h-dvh flex-col text-rt-ink">
      <SetupHeader
        current="New session"
        status="Not saved yet"
        onDashboard={leave}
        onCancel={leave}
      />
      <CreateSessionForm
        templates={templates}
        initialTemplate={template}
        autosaveKey={autosaveKey}
        onUnsavedWorkChange={setUnsaved}
        onSaved={(id) => {
          clearSetup(autosaveKey);
          toSession(id);
        }}
        onOpened={(session) => {
          clearSetup(autosaveKey);
          // Made, but it would not open: to the draft, which says why.
          if (session.openError) toSession(session.sessionId, session.openError);
          else setOpened(session);
        }}
      />
      {opened ? (
        <RoomSetMoment
          title={opened.title}
          code={opened.code}
          onDone={() => toSession(opened.sessionId)}
        />
      ) : null}
      {confirmingLeave && (
        <ConfirmDialog
          title="Discard this session?"
          confirmLabel="Discard"
          onConfirm={() => {
            clearSetup(autosaveKey);
            goToDashboard();
          }}
          onCancel={() => setConfirmingLeave(false)}
        >
          Nothing has been saved. The title and questions you've entered will be lost.
        </ConfirmDialog>
      )}
    </main>
  );
}
