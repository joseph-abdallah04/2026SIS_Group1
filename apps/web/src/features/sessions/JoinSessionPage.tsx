import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';

import { RoundTableLogo } from '../../components/RoundTableLogo';
import { Button } from '../../components/ui/Button';
import { api, ApiClientError } from '../../lib/api';
import { UNKNOWN_JOIN_BODY, UNKNOWN_JOIN_TITLE } from './joinCopy';

interface SessionPreview {
  id: string;
  title: string;
  status: 'draft' | 'lobby' | 'active' | 'ended';
  leaderId: string;
  questionCount: number;
}

function isUnknownJoinCode(err: unknown): boolean {
  if (!(err instanceof ApiClientError)) return false;
  return err.status === 404 || err.code === 'INVALID_CODE' || err.code === 'SESSION_NOT_JOINABLE';
}

/**
 * `/join/:code` — sits behind `RequireAuth`, so a pasted link still goes
 * through login (or signup) first, valid code or not. Resolves the code to a
 * preview before committing, then joins and hands off to `SessionRouter`.
 */
export function JoinSessionPage() {
  const { code } = useParams<{ code: string }>();
  const navigate = useNavigate();

  const [preview, setPreview] = useState<SessionPreview | null>(null);
  const [unknownCode, setUnknownCode] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);

  useEffect(() => {
    if (!code) {
      setUnknownCode(true);
      return;
    }
    let cancelled = false;
    const codeParam = code;

    async function load() {
      try {
        const data = await api.get<SessionPreview>(
          `/api/sessions/code/${encodeURIComponent(codeParam)}`,
        );
        if (!cancelled) setPreview(data);
      } catch (err) {
        if (cancelled) return;
        if (isUnknownJoinCode(err)) {
          setUnknownCode(true);
          return;
        }
        setError(err instanceof ApiClientError ? err.message : 'Failed to look up that code');
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
      if (isUnknownJoinCode(err)) {
        setUnknownCode(true);
        setJoining(false);
        return;
      }
      setError(err instanceof ApiClientError ? err.message : 'Failed to join that session');
      setJoining(false);
    }
  }

  return (
    <main className="flex min-h-screen flex-col bg-rt-surface text-rt-ink">
      <header className="flex shrink-0 items-center gap-4 border-b border-rt-secondary/40 bg-rt-primary px-6 py-[13px] text-rt-ink">
        <RoundTableLogo />
        <span className="text-[13px] font-semibold tracking-[-0.01em]">Join session</span>
      </header>

      <div className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center gap-4 px-6 py-10">
        {!preview && !unknownCode && !error && (
          <p className="text-[13px] text-rt-ink-muted">Looking up {code}…</p>
        )}

        {unknownCode && (
          <div className="flex w-full flex-col gap-4 rounded-lg border border-rt-tertiary bg-rt-surface p-5 text-center shadow-sm">
            <div>
              <h1 className="text-[16px] font-semibold tracking-[-0.01em]">{UNKNOWN_JOIN_TITLE}</h1>
              <p className="mt-2 text-[13px] leading-relaxed text-rt-ink-muted">
                {UNKNOWN_JOIN_BODY}
              </p>
            </div>
            <Link to="/dashboard">
              <Button type="button" className="w-full">
                Go to dashboard
              </Button>
            </Link>
          </div>
        )}

        {error && !unknownCode && (
          <div className="flex w-full flex-col gap-4 rounded-lg border border-rt-tertiary bg-rt-surface p-5 text-center shadow-sm">
            <p className="text-[13px] leading-relaxed text-rt-ink-muted">{error}</p>
            <Link to="/dashboard">
              <Button type="button" className="w-full">
                Go to dashboard
              </Button>
            </Link>
          </div>
        )}

        {preview && !unknownCode && (
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
