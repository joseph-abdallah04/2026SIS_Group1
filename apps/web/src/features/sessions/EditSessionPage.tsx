import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { SessionQuestionsForm, type SetupAction } from './SessionQuestionsForm';
import { SetupHeader } from './setup/SetupHeader';
import { useDeleteSession } from './useDeleteSession';
import { useSessionDetail } from './useSessionDetail';
import { useUpdateSession } from './useUpdateSession';

const ACTIONS: SetupAction[] = [
  { kind: 'save', label: 'Save changes', busyLabel: 'Saving…', primary: true },
];

/**
 * `/sessions/:id/edit` — F05. Only reachable for a draft the caller leads;
 * `updateSessionDraft`/`deleteSession` enforce that server-side regardless
 * of what this page lets you attempt, so the checks here are for a better
 * error message, not the real guard.
 *
 * The same page as creating one, without the templates. Saving or Cancel goes
 * back to the draft it came from, Dashboard to the dashboard; either way,
 * unsaved changes are asked about first.
 */
export function EditSessionPage() {
  const { id } = useParams<{ id: string }>();
  const sessionId = id ?? '';
  const navigate = useNavigate();
  const { session, loading, error: loadError } = useSessionDetail(sessionId);
  const { update, submitting, error: updateError } = useUpdateSession(sessionId);
  const { remove, deleting, error: deleteError } = useDeleteSession();
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [unsaved, setUnsaved] = useState(false);
  const [leavingFor, setLeavingFor] = useState<string | null>(null);
  const draftPath = `/sessions/${sessionId}`;

  async function handleDelete() {
    const ok = await remove(sessionId);
    if (ok) navigate('/dashboard');
  }

  function leaveFor(path: string) {
    if (unsaved) setLeavingFor(path);
    else navigate(path);
  }

  const editable = session && session.status === 'draft';

  return (
    <main className="rt-setup-page flex h-dvh flex-col text-rt-ink">
      <SetupHeader
        current="Edit draft"
        status="Draft"
        onDashboard={() => leaveFor('/dashboard')}
        onCancel={() => leaveFor(draftPath)}
      />

      {!editable && (
        <div className="flex flex-1 justify-center px-6 py-10">
          {loading && <p className="text-[13px] text-rt-ink-muted">Loading…</p>}
          {loadError && <p className="text-[13px] text-red-600">{loadError}</p>}
          {session && (
            <p className="text-[13px] text-rt-ink-muted">
              This session is no longer a draft and can't be edited.
            </p>
          )}
        </div>
      )}

      {editable && (
        <SessionQuestionsForm
          editingDraft
          initialTitle={session.title}
          initialQuestions={session.questions.map(({ text, votingEnabled }) => ({
            text,
            votingEnabled,
          }))}
          initialDiscussionTimerSeconds={session.discussionTimerSeconds}
          initialVotingTimerSeconds={session.votingTimerSeconds}
          initialVoiceEnabled={session.voiceEnabled}
          onUnsavedWorkChange={setUnsaved}
          actions={ACTIONS}
          busy={submitting ? 'save' : null}
          error={updateError}
          onSubmit={async (input) => {
            const updated = await update(input);
            if (updated) navigate(draftPath);
          }}
          footerStart={
            <button
              type="button"
              onClick={() => setConfirmingDelete(true)}
              className="h-8 rounded-full px-3 text-[12.5px] font-semibold text-red-700 hover:bg-red-50 focus-visible:ring-2 focus-visible:ring-rt-secondary focus-visible:outline-none"
            >
              Delete draft
            </button>
          }
        />
      )}

      {confirmingDelete && (
        <ConfirmDialog
          title="Delete this draft?"
          confirmLabel="Delete"
          confirmingLabel="Deleting…"
          busy={deleting}
          onConfirm={() => void handleDelete()}
          onCancel={() => setConfirmingDelete(false)}
        >
          This cannot be undone. The draft will be removed from your dashboard.
          {deleteError && <p className="mt-2 text-red-600">{deleteError}</p>}
        </ConfirmDialog>
      )}

      {leavingFor && (
        <ConfirmDialog
          title="Discard your changes?"
          confirmLabel="Discard"
          onConfirm={() => navigate(leavingFor)}
          onCancel={() => setLeavingFor(null)}
        >
          The draft keeps what it had before you started editing.
        </ConfirmDialog>
      )}
    </main>
  );
}
