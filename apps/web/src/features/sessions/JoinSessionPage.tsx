import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { RoundTableLogo } from '../../components/RoundTableLogo';
import { Button } from '../../components/ui/Button';
import { api, ApiClientError } from '../../lib/api';

interface SessionPreview {
  id: string;
  title: string;
  status: 'draft' | 'lobby' | 'active' | 'ended';
  leaderId: string;
  questionCount: number;
}

/**
 * `/join/:code` — resolves the code to a preview before committing to
 * anything (so a mistyped code fails with a clear message rather than a
 * silent join), then joins and hands off to `SessionRouter`, which lands the
 * new member in the waiting room once it sees they're now a member.
 */
export function JoinSessionPage() {
  const { code } = useParams<{ code: string }>();
  const navigate = useNavigate();

  const [preview, setPreview] = useState<SessionPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);

  useEffect(() => {
    if (!code) return;
    let cancelled = false;
    const codeParam = code;

    async function load() {
      try {
        const data = await api.get<SessionPreview>(
          `/api/sessions/code/${encodeURIComponent(codeParam)}`,
        );
        if (!cancelled) setPreview(data);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof ApiClientError ? err.message : 'Failed to look up that code');
        }
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [code]);

  async function handleJoin() {
    if (!code) return;
    setJoining(true);
    setError(null);
    try {
      const { sessionId } = await api.post<{ sessionId: string }>('/api/sessions/join', { code });
      navigate(`/sessions/${sessionId}`, { replace: true });
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Failed to join that session');
      setJoining(false);
    }
  }

  return (
    <main className="flex min-h-screen flex-col bg-rt-surface text-rt-ink">
      <header className="flex shrink-0 items-center gap-4 border-b border-rt-primary-tint bg-rt-primary px-6 py-[13px] text-white">
        <RoundTableLogo />
        <span className="text-[13px] font-semibold tracking-[-0.01em]">Join session</span>
      </header>

      <div className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center gap-4 px-6 py-10">
        {!preview && !error && <p className="text-[13px] text-rt-ink-muted">Looking up {code}…</p>}

        {error && (
          <div className="w-full rounded-lg border border-rt-tertiary bg-rt-surface-alt p-4 text-center">
            <p className="text-[13px] text-red-600">{error}</p>
          </div>
        )}

        {preview && (
          <div className="flex w-full flex-col gap-4 rounded-lg border border-rt-tertiary bg-rt-surface-alt p-5 text-center">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-rt-ink-faint">
                You're about to join
              </p>
              <p className="mt-1 text-[19px] font-semibold tracking-[-0.01em]">{preview.title}</p>
              <p className="mt-1 text-[13px] text-rt-ink-muted">
                {preview.questionCount} question{preview.questionCount === 1 ? '' : 's'}
              </p>
            </div>
            <Button type="button" onClick={() => void handleJoin()} disabled={joining}>
              {joining ? 'Joining…' : 'Join session'}
            </Button>
          </div>
        )}
      </div>
    </main>
  );
}
