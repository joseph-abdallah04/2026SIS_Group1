import { useEffect, useState, type ReactNode } from 'react';
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
 *
 * It sits at the top of an `AppPage`, which scrolls the page under it.
 */
export function AppHeader({
  current,
  user,
  status,
  actions,
}: {
  /** Where you are: "Dashboard", or the last step of the trail ("Settings", "Recap"). */
  current: string;
  /** From `useMe`, on the page. */
  user: User | null;
  /** How things stand, beside the trail: "Ended 14 Oct". Left out on a phone. */
  status?: string;
  /** The page's own buttons, at the right before the avatar. */
  actions?: ReactNode;
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
  // breadcrumb, so moving between them the bar does not change. Above the
  // page's scroll area (`z-30`), so the account menu opens over the page.
  return (
    <header className="relative z-30 flex h-13 shrink-0 items-center gap-2 border-b border-rt-secondary/40 bg-rt-secondary-wash px-3 text-rt-ink sm:gap-3 sm:px-5">
      <RoundTableLogo className="h-6.5 w-auto shrink-0" />
      {current === 'Dashboard' ? (
        <h1 className="text-[13px] font-semibold">Dashboard</h1>
      ) : (
        <nav aria-label="Breadcrumb" className="min-w-0 text-[13px]">
          <ol className="flex min-w-0 items-center gap-1.5">
            <li className="shrink-0">
              <Link to="/dashboard" className="font-medium text-rt-ink-muted hover:text-rt-ink">
                Dashboard
              </Link>
            </li>
            {/* With buttons of its own beside it, a phone's bar keeps only the
                way back: the page's heading already says where this is. */}
            <li aria-hidden className={`shrink-0 ${actions ? 'hidden sm:flex' : 'flex'}`}>
              <ChevronRight size={13} className="text-rt-secondary-deep/50" />
            </li>
            <li
              aria-current="page"
              className={`truncate font-semibold text-rt-ink ${actions ? 'hidden sm:block' : ''}`}
            >
              {current}
            </li>
          </ol>
        </nav>
      )}
      {status ? (
        <span className="hidden items-center gap-1.5 text-[11.5px] whitespace-nowrap text-rt-ink-muted md:inline-flex">
          <span aria-hidden className="size-1.5 rounded-full bg-[#c9bfae]" />
          {status}
        </span>
      ) : null}
      <span aria-hidden className="min-w-2 flex-1" />
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
      <AccountMenu user={user} onLogout={() => void onLogout()} />
    </header>
  );
}
