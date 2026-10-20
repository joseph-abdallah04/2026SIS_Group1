import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import type { User } from '@roundtable/shared';

import { RoundTableLogo } from '../../components/RoundTableLogo';
import { clearToken } from '../../lib/auth';
import { getCurrentUserId } from '../../lib/currentUser';
import { disconnectSocket } from '../../lib/socket';
import { getMe, logout } from '../auth/api';
import { forgetSetup } from '../sessions/setup/setupAutosave';
import { AccountMenu } from './AccountMenu';

/**
 * The signed-in person, for the avatar (and the dashboard's greeting). Null
 * until it arrives, or if it fails. Asked for once by the page and handed to
 * its header, so the two never ask twice.
 */
export function useMe(): User | null {
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
 * heading. Anywhere else it is a trail back to the dashboard ("Dashboard ›
 * Settings"), and the page has a heading of its own.
 */
export function AppHeader({
  page,
  user,
}: {
  page: 'Dashboard' | 'Settings';
  /** From `useMe`, on the page. */
  user: User | null;
}) {
  const navigate = useNavigate();

  // Clears the token even if the request fails: the token is stateless, so the
  // client dropping it *is* the logout (see auth's `/logout` route) — a network
  // error must not leave someone stuck logged in. Also drops the socket
  // singleton, otherwise a same-tab login as someone else would keep the
  // previous identity's live connection around, and lets go of any session
  // setup this browser was keeping for them (a shared computer).
  async function onLogout() {
    try {
      await logout();
    } finally {
      forgetSetup(getCurrentUserId());
      clearToken();
      disconnectSocket();
      navigate('/login', { replace: true });
    }
  }

  // The setup pages' measure (`SetupHeader`): 52px of wash, the same logo and
  // breadcrumb, so moving between them the bar does not change. It stays at
  // the top as the page scrolls under it.
  return (
    <header className="sticky top-0 z-30 flex h-13 shrink-0 items-center gap-3 border-b border-rt-secondary/40 bg-rt-secondary-wash px-3 text-rt-ink sm:px-5">
      <RoundTableLogo className="h-6.5 w-auto shrink-0" />
      {page === 'Dashboard' ? (
        <h1 className="text-[13px] font-semibold">Dashboard</h1>
      ) : (
        <nav aria-label="Breadcrumb" className="text-[13px]">
          <ol className="flex items-center gap-1.5">
            <li>
              <Link to="/dashboard" className="font-medium text-rt-ink-muted hover:text-rt-ink">
                Dashboard
              </Link>
            </li>
            <li aria-hidden className="flex">
              <ChevronRight size={13} className="text-rt-secondary-deep/50" />
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
