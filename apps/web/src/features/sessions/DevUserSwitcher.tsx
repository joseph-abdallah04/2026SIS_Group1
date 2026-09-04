import { useState } from 'react';

import { Button } from '../../components/ui/Button';
import { DEV_USER_ID_KEY } from '../../lib/currentUser';

/**
 * Dev-only identity switcher — the write side of `lib/currentUser.ts`. There
 * is no login yet (docs/05 deferred item 5), so every REST request and socket
 * handshake acts as whichever id is stored here. Paste a seeded user's id —
 * from `db:seed`'s output, or `SELECT id, email FROM users` against the local
 * Postgres — to act as them.
 *
 * Renders nothing in a production build.
 */
export function DevUserSwitcher() {
  const [devUserId, setDevUserId] = useState(() => localStorage.getItem(DEV_USER_ID_KEY) ?? '');
  const [saved, setSaved] = useState(false);

  if (!import.meta.env.DEV) return null;

  function save() {
    if (devUserId.trim()) {
      localStorage.setItem(DEV_USER_ID_KEY, devUserId.trim());
    } else {
      localStorage.removeItem(DEV_USER_ID_KEY);
    }
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  }

  return (
    <div className="flex items-center gap-2 rounded-lg border border-dashed border-rt-secondary bg-rt-secondary-wash px-3 py-2 text-[12px] text-rt-secondary-deep">
      <span className="font-semibold uppercase tracking-[0.08em]">Dev identity</span>
      <input
        type="text"
        value={devUserId}
        onChange={(e) => setDevUserId(e.target.value)}
        placeholder="paste a seeded user id"
        className="min-h-8 flex-1 rounded-md border border-rt-secondary/50 bg-white px-2 text-[12px] text-rt-ink outline-none"
      />
      <Button type="button" variant="secondary" onClick={save} className="min-h-8 px-3 text-[12px]">
        {saved ? 'Saved' : 'Set'}
      </Button>
    </div>
  );
}
