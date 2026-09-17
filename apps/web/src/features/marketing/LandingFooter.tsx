import { Link } from 'react-router-dom';

import { RoundTableLogo } from '../../components/RoundTableLogo';
import { isSignedIn } from './signedIn';

export function LandingFooter() {
  const signedIn = isSignedIn();

  return (
    <footer className="border-t border-rt-secondary/25 px-6 py-10">
      <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-6 sm:flex-row sm:items-center">
        <Link to="/" className="flex items-center gap-2.5 text-rt-ink">
          <RoundTableLogo className="h-7 w-auto" />
          <span className="text-[14px] font-semibold tracking-[-0.02em]">RoundTable</span>
        </Link>
        <nav className="flex items-center gap-5 text-[13px] font-semibold">
          {signedIn ? (
            <Link to="/dashboard" className="text-rt-ink-muted hover:text-rt-ink hover:underline">
              Dashboard
            </Link>
          ) : (
            <>
              <Link to="/login" className="text-rt-ink-muted hover:text-rt-ink hover:underline">
                Log in
              </Link>
              <Link to="/signup" className="text-rt-ink-muted hover:text-rt-ink hover:underline">
                Sign up
              </Link>
            </>
          )}
        </nav>
      </div>
    </footer>
  );
}
