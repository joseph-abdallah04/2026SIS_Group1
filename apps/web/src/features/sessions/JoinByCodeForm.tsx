import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
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
        className="flex flex-col gap-3 rounded-lg bg-rt-primary px-4 py-4"
      >
        <p className="text-[13px] font-semibold text-rt-ink">Join a session</p>
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={code}
            onChange={(event) => setCode(event.target.value)}
            placeholder="Have a code? e.g. K7NP-3WQZ"
            className="min-h-10 flex-1 rounded-lg border border-transparent bg-rt-surface px-3 text-[13px] text-rt-ink outline-none focus-visible:ring-2 focus-visible:ring-rt-ink focus-visible:ring-offset-2 focus-visible:ring-offset-rt-primary"
          />
          <Button
            type="submit"
            variant="secondary"
            disabled={checking}
            className="border-transparent bg-white hover:bg-rt-primary-tint"
          >
            {checking ? 'Checking…' : 'Join'}
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
