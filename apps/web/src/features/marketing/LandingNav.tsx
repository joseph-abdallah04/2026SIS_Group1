import { Link } from 'react-router-dom';

import { RoundTableLogo } from '../../components/RoundTableLogo';
import { ctaGhost, ctaPrimary } from './cta';
import { isSignedIn } from './signedIn';

export function LandingNav() {
  const signedIn = isSignedIn();

  return (
    <header className="sticky top-0 z-50 border-b border-rt-secondary/25 bg-[#f7f4ee]/85 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-6">
        <Link to="/" className="flex items-center gap-2.5 text-rt-ink">
          <RoundTableLogo className="h-8 w-auto" />
          <span className="text-[15px] font-semibold tracking-[-0.02em]">RoundTable</span>
        </Link>
        <nav className="ml-auto flex items-center gap-1">
          {signedIn ? (
            <Link to="/dashboard" className={ctaPrimary}>
              Dashboard
            </Link>
          ) : (
            <>
              <Link to="/login" className={ctaGhost}>
                Log in
              </Link>
              <Link to="/signup" className={ctaPrimary}>
                Sign up
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
