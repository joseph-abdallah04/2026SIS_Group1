import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { useCurrentUserId } from '../../lib/currentUser';
import type { DashboardState } from '../dashboard/dashboardState';
import { CreateSessionForm } from './CreateSessionForm';
import { clearSetup, setupAutosaveKey } from './setup/setupAutosave';
import { SetupHeader } from './setup/SetupHeader';
import { useLeaveWarning } from './setup/useLeaveWarning';
import { findTemplate, useSessionTemplates } from './templates';
import { JUST_OPENED } from './waitingRoomState';

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
  const autosaveKey = setupAutosaveKey(useCurrentUserId());
  // Saved, opened or discarded: done with. From then on the form keeps
  // nothing in this browser, so no save still waiting can put back the copy
  // just let go of before this page has gone.
  const [finished, setFinished] = useState(false);

  function finish() {
    setFinished(true);
    clearSetup(autosaveKey);
  }

  // Refresh, close or typing a new address would lose it all without a word.
  // (In-app Back is covered by the copy kept in this browser instead.) Once
  // it is saved or open there is nothing left to lose.
  useLeaveWarning(unsaved && !finished);

  function goToDashboard() {
    navigate('/dashboard');
  }

  /** The breadcrumb: asks first only when there is something to lose. */
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
    <main className="rt-setup-page flex h-dvh flex-col overflow-hidden text-rt-ink">
      {/* Cancel always asks, being a decision to drop the session; it says
          whether anything would be lost. */}
      <SetupHeader
        current="New session"
        onDashboard={leave}
        onCancel={() => setConfirmingLeave(true)}
      />
      <CreateSessionForm
        templates={templates}
        initialTemplate={template}
        autosaveKey={finished ? null : autosaveKey}
        onUnsavedWorkChange={setUnsaved}
        onSaved={(id) => {
          finish();
          // Saved for later: back to where it is picked up again, which
          // points it out.
          navigate('/dashboard', {
            replace: true,
            state: { savedDraftId: id } satisfies DashboardState,
          });
        }}
        onOpened={(session) => {
          finish();
          // Made, but it would not open: to the draft, which says why.
          // Open: straight into the waiting room, where the code arrives.
          if (session.openError) toSession(session.sessionId, session.openError);
          else navigate(`/sessions/${session.sessionId}`, JUST_OPENED);
        }}
      />
      {confirmingLeave && (
        <ConfirmDialog
          title={unsaved ? 'Discard this session?' : 'Cancel this session?'}
          confirmLabel={unsaved ? 'Discard' : 'Cancel session'}
          cancelLabel="Keep editing"
          onConfirm={() => {
            finish();
            goToDashboard();
          }}
          onCancel={() => setConfirmingLeave(false)}
        >
          {unsaved
            ? "Nothing has been saved. The title and questions you've entered will be lost."
            : 'You haven’t written anything yet, so nothing will be lost.'}
        </ConfirmDialog>
      )}
    </main>
  );
}
