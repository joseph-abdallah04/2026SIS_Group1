import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { normalizeSessionCode } from '@roundtable/shared';

import { Button } from '../../components/ui/Button';
import { NoticeDialog } from '../../components/ui/NoticeDialog';
import { api } from '../../lib/api';
import { UNKNOWN_JOIN_BODY, UNKNOWN_JOIN_TITLE } from './joinCopy';

/**
 * Dashboard join-by-code. Looks the code up here so a typo or a dead session
 * stays on this page (a notice), instead of dumping the user on `/join/:code`.
 * A real code still goes to the join page to confirm before becoming a member.
 */
export function JoinByCodeForm() {
  const [code, setCode] = useState('');
  const [checking, setChecking] = useState(false);
  const [unknown, setUnknown] = useState(false);
  const navigate = useNavigate();

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const normalized = normalizeSessionCode(code);
    if (!normalized) {
      setUnknown(true);
      return;
    }

    setChecking(true);
    try {
      await api.get(`/api/sessions/code/${encodeURIComponent(normalized)}`);
      navigate(`/join/${normalized}`);
    } catch {
      // Auth failures already bounce to login in `api`. Anything else — a
      // typo, an ended session whose code was released — stays here.
      setUnknown(true);
    } finally {
      setChecking(false);
    }
  }

  return (
    <>
      <form
        onSubmit={(event) => void handleSubmit(event)}
        aria-labelledby="join-session-title"
        className="flex flex-col rounded-3xl bg-rt-secondary-wash p-6 sm:p-7"
      >
        <p className="text-[11px] font-semibold tracking-[0.12em] text-rt-secondary-deep uppercase">
          Join a session
        </p>
        <h2 id="join-session-title" className="mt-2 text-[20px] font-semibold tracking-[-0.01em]">
          Got a code? Jump straight in.
        </h2>
        <p className="mt-1.5 text-[13px] text-rt-ink-muted">
          Your session leader shares a code like{' '}
          <span className="whitespace-nowrap">K7NP-3WQZ</span>.
        </p>
        <div className="mt-auto flex items-center gap-2 pt-5">
          <label htmlFor="join-session-code" className="sr-only">
            Session code
          </label>
          <input
            id="join-session-code"
            autoComplete="off"
            type="text"
            value={code}
            onChange={(event) => setCode(event.target.value)}
            placeholder="e.g. K7NP-3WQZ"
            className="min-h-12 min-w-0 flex-1 rounded-full border border-rt-secondary/30 bg-rt-surface px-5 text-[15px] font-semibold tracking-[0.08em] text-rt-ink uppercase outline-none placeholder:font-normal placeholder:tracking-normal placeholder:text-rt-ink-faint placeholder:normal-case focus-visible:border-rt-secondary focus-visible:ring-2 focus-visible:ring-rt-secondary/30"
          />
          <Button type="submit" disabled={checking} className="min-h-12 px-5 text-[14px]">
            {checking ? 'Checking…' : 'Join'}
            {checking ? null : <ArrowRight aria-hidden size={15} strokeWidth={2.4} />}
          </Button>
        </div>
      </form>
      {unknown && (
        <NoticeDialog title={UNKNOWN_JOIN_TITLE} onDismiss={() => setUnknown(false)}>
          {UNKNOWN_JOIN_BODY}
        </NoticeDialog>
      )}
    </>
  );
}
