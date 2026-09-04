import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { RoundTableLogo } from '../../components/RoundTableLogo';
import { Button } from '../../components/ui/Button';
import { SessionQuestionsForm } from './SessionQuestionsForm';
import { useDeleteSession } from './useDeleteSession';
import { useSessionDetail } from './useSessionDetail';
import { useUpdateSession } from './useUpdateSession';

/**
 * `/sessions/:id/edit` — F05. Only reachable for a draft the caller leads;
 * `updateSessionDraft`/`deleteSession` enforce that server-side regardless
 * of what this page lets you attempt, so the checks here are for a better
 * error message, not the real guard.
 */
export function EditSessionPage() {
  const { id } = useParams<{ id: string }>();
  const sessionId = id ?? '';
  const navigate = useNavigate();
  const { session, loading, error: loadError } = useSessionDetail(sessionId);
  const { update, submitting, error: updateError } = useUpdateSession(sessionId);
  const { remove, deleting, error: deleteError } = useDeleteSession();
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  async function handleDelete() {
    const ok = await remove(sessionId);
    if (ok) navigate('/dashboard');
  }

  return (
    <main className="flex min-h-screen flex-col bg-rt-surface text-rt-ink">
      <header className="flex shrink-0 items-center gap-4 border-b border-rt-primary-tint bg-rt-primary px-6 py-[13px] text-white">
        <RoundTableLogo />
        <span className="text-[13px] font-semibold tracking-[-0.01em]">Edit session</span>
      </header>

      <div className="flex flex-1 justify-center px-6 py-10">
        {loading && <p className="text-[13px] text-rt-ink-muted">Loading…</p>}
        {loadError && <p className="text-[13px] text-red-600">{loadError}</p>}

        {session && session.status !== 'draft' && (
          <p className="text-[13px] text-rt-ink-muted">
            This session is no longer a draft and can't be edited.
          </p>
        )}

        {session && session.status === 'draft' && (
          <SessionQuestionsForm
            initialTitle={session.title}
            initialQuestions={session.questions.map((q) => q.text)}
            submitLabel="Save changes"
            submittingLabel="Saving…"
            submitting={submitting}
            error={updateError}
            onSubmit={async (input) => {
              const updated = await update(input);
              if (updated) navigate('/dashboard');
            }}
            extraActions={
              confirmingDelete ? (
                <div className="flex items-center gap-2">
                  <span className="text-[13px] text-rt-ink-muted">Delete this draft?</span>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => void handleDelete()}
                    disabled={deleting}
                  >
                    {deleting ? 'Deleting…' : 'Yes, delete'}
                  </Button>
                  <Button type="button" variant="secondary" onClick={() => setConfirmingDelete(false)}>
                    Cancel
                  </Button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmingDelete(true)}
                  className="text-[13px] font-semibold text-red-600 hover:underline"
                >
                  Delete draft
                </button>
              )
            }
          />
        )}

        {deleteError && <p className="mt-2 text-[13px] text-red-600">{deleteError}</p>}
      </div>
    </main>
  );
}
