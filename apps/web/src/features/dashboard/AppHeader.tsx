import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { User } from '@roundtable/shared';

import { RoundTableLogo } from '../../components/RoundTableLogo';
import { clearToken } from '../../lib/auth';
import { disconnectSocket } from '../../lib/socket';
import { getMe, logout } from '../auth/api';
import { AccountMenu } from './AccountMenu';

/** The signed-in person, for the avatar. Null until it arrives, or if it fails. */
function useMe(): User | null {
  const [user, setUser] = useState<User | null>(null);
  useEffect(() => {
    let cancelled = false;
    getMe()
      .then(({ user: me }) => {
        if (!cancelled) setUser(me);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);
  return user;
}

/**
 * The bar across the top of the pages outside a session: the logo, where you
 * are, and your account.
 *
 * On the dashboard, where it is the page's only title, it is the page's
 * heading. Anywhere else it is a trail back to the dashboard ("Dashboard /
 * Settings"), and the page has a heading of its own.
 */
export function AppHeader({ page }: { page: 'Dashboard' | 'Settings' }) {
  const navigate = useNavigate();
  const user = useMe();

  // Clears the token even if the request fails: the token is stateless, so the
  // client dropping it *is* the logout (see auth's `/logout` route) — a network
  // error must not leave someone stuck logged in. Also drops the socket
  // singleton, otherwise a same-tab login as someone else would keep the
  // previous identity's live connection around.
  async function onLogout() {
    try {
      await logout();
    } finally {
      clearToken();
      disconnectSocket();
      navigate('/login', { replace: true });
    }
  }

  return (
    <header className="flex shrink-0 items-center gap-3 border-b border-rt-secondary/40 bg-rt-secondary-wash px-4 py-2.5 sm:px-6">
      <RoundTableLogo />
      {page === 'Dashboard' ? (
        <h1 className="text-[13px] font-semibold tracking-[-0.01em]">Dashboard</h1>
      ) : (
        <nav aria-label="Breadcrumb" className="text-[13px] tracking-[-0.01em]">
          <ol className="flex items-center gap-2">
            <li>
              <Link
                to="/dashboard"
                className="font-medium text-rt-ink-muted hover:text-rt-ink hover:underline"
              >
                Dashboard
              </Link>
            </li>
            <li aria-hidden className="text-rt-ink-faint">
              /
            </li>
            <li aria-current="page" className="font-semibold text-rt-ink">
              {page}
            </li>
          </ol>
        </nav>
      )}
      <AccountMenu user={user} onLogout={() => void onLogout()} />
    </header>
  );
}
