import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { DoorOpen } from 'lucide-react';
import type { Session } from '@roundtable/shared';

import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { api, ApiClientError } from '../../lib/api';
import type { DashboardState } from '../dashboard/dashboardState';
import type { DraftPageState } from './CreateSessionPage';
import { SessionQuestionsForm, type SetupAction } from './SessionQuestionsForm';
import { SetupHeader } from './setup/SetupHeader';
import { useLeaveWarning } from './setup/useLeaveWarning';
import { useDeleteSession } from './useDeleteSession';
import { useSessionDetail } from './useSessionDetail';
import { useUpdateSession } from './useUpdateSession';
import { JUST_OPENED } from './waitingRoomState';

/**
 * Save for later, or open the room now (the primary, and Ctrl/⌘+Enter), as on
 * the create page: drafts are opened from the dashboard straight into this
 * page, so this is where a draft is started.
 */
const ACTIONS: SetupAction[] = [
  { kind: 'save', label: 'Save changes', busyLabel: 'Saving…' },
  {
    kind: 'open',
    label: 'Open the room',
    busyLabel: 'Opening…',
    primary: true,
    icon: <DoorOpen aria-hidden size={16} />,
  },
];

/**
 * `/sessions/:id/edit` — F05. Only reachable for a draft the caller leads;
 * `updateSessionDraft`/`deleteSession` enforce that server-side regardless
 * of what this page lets you attempt, so the checks here are for a better
 * error message, not the real guard.
 *
 * The same page as creating one, without the templates. Saving, Cancel and
 * Dashboard all go back to the dashboard, where the draft is opened from;
 * saving says so there and points the draft out. Cancel always asks first, as
 * on the create page; Dashboard asks only when there are changes to lose.
 *
 * Opening the room saves the edits first, then opens it for joining (F06)
 * and goes straight to the waiting room. Saved but not opened, it goes to the
 * draft page, which says why, as creating one does.
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
  // Which button is at work: held through opening, until the page has moved
  // on, so nothing is sent twice.
  const [busy, setBusy] = useState<string | null>(null);
  // Refresh or close would throw the edits away without a word.
  useLeaveWarning(unsaved && busy !== 'open');
  const [leavingFor, setLeavingFor] = useState<string | null>(null);
  const draftPath = `/sessions/${sessionId}`;

  async function saveAndOpen(input: Parameters<typeof update>[0]) {
    if (!(await update(input))) return false;
    try {
      await api.post<Session>(`/api/sessions/${sessionId}/open`, {});
      // Open: its page is the waiting room now, where the code arrives.
      navigate(draftPath, JUST_OPENED);
    } catch (err) {
      const openError = err instanceof ApiClientError ? err.message : 'Failed to open the session';
      navigate(draftPath, { replace: true, state: { openError } satisfies DraftPageState });
    }
    return true;
  }

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
    <main className="rt-setup-page flex h-dvh flex-col overflow-hidden text-rt-ink">
      <SetupHeader
        current="Edit draft"
        status="Draft"
        onDashboard={() => leaveFor('/dashboard')}
        // Cancel always asks, as it does when creating one; it says whether
        // anything would be lost.
        onCancel={() => setLeavingFor('/dashboard')}
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
          busy={busy ?? (submitting ? 'save' : null)}
          error={updateError}
          onSubmit={async (input, kind) => {
            setBusy(kind);
            if (kind === 'open') {
              if (!(await saveAndOpen(input))) setBusy(null);
              return;
            }
            const updated = await update(input);
            if (updated) {
              navigate('/dashboard', {
                state: { savedDraftId: sessionId } satisfies DashboardState,
              });
            } else {
              setBusy(null);
            }
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
          title={unsaved ? 'Discard your changes?' : 'Stop editing this draft?'}
          confirmLabel={unsaved ? 'Discard' : 'Stop editing'}
          cancelLabel="Keep editing"
          onConfirm={() => navigate(leavingFor)}
          onCancel={() => setLeavingFor(null)}
        >
          {unsaved
            ? 'The draft keeps what it had before you started editing.'
            : 'Nothing has changed, so the draft stays as it is.'}
        </ConfirmDialog>
      )}
    </main>
  );
}
