import { motion, useScroll, useSpring } from 'motion/react';
import type { MouseEvent } from 'react';
import { Link } from 'react-router-dom';

import { RoundTableLogo } from '../../components/RoundTableLogo';
import { ctaGhost, ctaPrimary } from './cta';
import { prefersReducedLandingMotion, scrollToLandingHash } from './landingScroll';
import { isSignedIn } from './signedIn';

const SECTIONS = [
  { href: '#how-it-runs', label: 'How it runs' },
  { href: '#pinboard', label: 'Pinboard' },
  { href: '#voting', label: 'Voting' },
  { href: '#assistant', label: 'Assistant' },
  { href: '#recap', label: 'Recap' },
];

function scrollToSection(event: MouseEvent<HTMLAnchorElement>) {
  const href = event.currentTarget.getAttribute('href');
  if (!href?.startsWith('#')) return;
  if (!document.getElementById(href.slice(1))) return;

  event.preventDefault();
  scrollToLandingHash(href, prefersReducedLandingMotion() ? 'auto' : 'smooth');
  window.history.pushState(null, '', href);
}

export function LandingNav() {
  const signedIn = isSignedIn();
  const { scrollYProgress } = useScroll();
  const progress = useSpring(scrollYProgress, { stiffness: 140, damping: 26, mass: 0.3 });

  return (
    <header className="sticky top-0 z-50 border-b border-rt-secondary/15 bg-[#f7f4ee]/85 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-6 px-6">
        <Link
          to="/"
          className="flex items-center gap-2.5 rounded-md focus-visible:ring-2 focus-visible:ring-rt-secondary focus-visible:outline-none"
        >
          <RoundTableLogo className="h-7 w-auto shrink-0" />
          <span className="font-serif text-[17px] font-bold tracking-tight text-rt-ink">
            RoundTable
          </span>
        </Link>

        <nav aria-label="Page sections" className="ml-4 hidden items-center gap-1 lg:flex">
          {SECTIONS.map((section) => (
            <a
              key={section.href}
              href={section.href}
              onClick={scrollToSection}
              className="rounded-full px-3 py-2 text-[13px] font-medium text-rt-ink-muted transition-colors hover:bg-white/70 hover:text-rt-ink"
            >
              {section.label}
            </a>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2">
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
        </div>
      </div>

      <motion.div
        aria-hidden="true"
        className="rt-landing-progress absolute inset-x-0 bottom-0 h-[2px]"
        style={{ scaleX: progress }}
      />
    </header>
  );
}
