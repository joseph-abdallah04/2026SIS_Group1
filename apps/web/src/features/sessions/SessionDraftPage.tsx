import { useState } from 'react';
import type { Session } from '@roundtable/shared';

import { RoundTableLogo } from '../../components/RoundTableLogo';
import { Button } from '../../components/ui/Button';
import { api, ApiClientError, getDevUserId } from '../../lib/api';
import type { SessionDetail } from './useSessionDetail';

interface CopyFieldProps {
  label: string;
  value: string;
}

/** A read-only value with a "Copy" button — used for both the code and the join link. */
function CopyField({ label, value }: CopyFieldProps) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-rt-ink-faint">
        {label}
      </span>
      <div className="flex items-center gap-2">
        <code className="min-h-10 flex-1 rounded-lg border border-rt-tertiary bg-rt-surface-alt px-3 py-2 text-[13px] text-rt-ink">
          {value}
        </code>
        <Button type="button" variant="secondary" onClick={() => void copy()}>
          {copied ? 'Copied' : 'Copy'}
        </Button>
      </div>
    </div>
  );
}

interface SessionDraftPageProps {
  session: SessionDetail;
  /** Tells `SessionRouter` to refetch — called once the leader is done looking at the code. */
  onOpened: () => void;
}

/**
 * F04's setup screen plus F06's "open for joining" action. Stays on this
 * screen after opening (rather than jumping straight to the waiting room) so
 * the leader has a moment to actually copy the code/link before it scrolls
 * away — "Continue" is what hands off to `SessionRouter`, which will see
 * `status: 'lobby'` on the next fetch and switch to `WaitingRoom` itself.
 */
export function SessionDraftPage({ session, onOpened }: SessionDraftPageProps) {
  const [opened, setOpened] = useState<Session | null>(null);
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isLeader = session.leaderId === getDevUserId();
  const code = opened?.code ?? null;
  const joinLink = code ? `${window.location.origin}/join/${code}` : null;

  async function handleOpen() {
    setOpening(true);
    setError(null);
    try {
      const updated = await api.post<Session>(`/api/sessions/${session.id}/open`, {});
      setOpened(updated);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Failed to open the session');
    } finally {
      setOpening(false);
    }
  }

  return (
    <main className="flex min-h-screen flex-col bg-rt-surface text-rt-ink">
      <header className="flex shrink-0 items-center gap-4 border-b border-rt-primary-tint bg-rt-primary px-6 py-[13px] text-white">
        <RoundTableLogo />
        <span className="text-[13px] font-semibold tracking-[-0.01em]">Session setup</span>
      </header>

      <div className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-6 px-6 py-10">
        <div>
          <h1 className="text-[19px] font-semibold tracking-[-0.01em]">{session.title}</h1>
          <p className="mt-1 text-[13px] text-rt-ink-muted">Draft — not joinable yet</p>
        </div>

        <ol className="flex flex-col gap-2">
          {session.questions.map((question, index) => (
            <li
              key={question.id}
              className="flex items-baseline gap-2 rounded-lg border border-rt-tertiary bg-rt-surface px-3 py-2 text-[13px]"
            >
              <span className="font-semibold text-rt-ink-faint">{index + 1}.</span>
              <span className="text-rt-ink">{question.text}</span>
            </li>
          ))}
        </ol>

        {!isLeader && (
          <p className="text-[13px] text-rt-ink-muted">
            Only the session leader can open this for joining.
          </p>
        )}

        {isLeader && !code && (
          <>
            {error && <p className="text-[13px] text-red-600">{error}</p>}
            <Button type="button" onClick={() => void handleOpen()} disabled={opening} className="self-start">
              {opening ? 'Opening…' : 'Open for joining'}
            </Button>
          </>
        )}

        {isLeader && code && joinLink && (
          <div className="flex flex-col gap-4 rounded-lg border border-rt-tertiary bg-rt-surface-alt p-4">
            <p className="text-[13px] text-rt-ink">
              Session is open. Share either of these so others can join.
            </p>
            <CopyField label="Code" value={code} />
            <CopyField label="Link" value={joinLink} />
            <Button type="button" onClick={onOpened} className="self-start">
              Continue to waiting room
            </Button>
          </div>
        )}
      </div>
    </main>
  );
}
