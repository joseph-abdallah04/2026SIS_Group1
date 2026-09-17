import { useReducedMotion } from 'motion/react';
import { useEffect, useRef, type MouseEvent } from 'react';

import { AssistantBeat } from './AssistantBeat';
import { FinalCta } from './FinalCta';
import { Hero } from './Hero';
import { HowItRuns } from './HowItRuns';
import { LandingFooter } from './LandingFooter';
import { LandingNav } from './LandingNav';
import { scrollToLandingHash } from './landingScroll';
import { PinboardBeat } from './PinboardBeat';
import { RecapBeat } from './RecapBeat';
import { VotingBeat } from './VotingBeat';
import './landing.css';

export function LandingPage() {
  const reduce = useReducedMotion();
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Load/refresh with `/#voting` (the click path already scrolled; this is
    // the case the browser cannot do itself because the ids are not in the
    // first HTML). Auto, not smooth: a 360vh film jump from the top would
    // otherwise animate the whole page.
    scrollToLandingHash(window.location.hash, 'auto');
    const onHash = () => scrollToLandingHash(window.location.hash, 'auto');
    window.addEventListener('hashchange', onHash);
    window.addEventListener('popstate', onHash);
    return () => {
      window.removeEventListener('hashchange', onHash);
      window.removeEventListener('popstate', onHash);
    };
  }, []);

  const onMove = (event: MouseEvent<HTMLDivElement>) => {
    if (reduce || !rootRef.current) return;
    const width = window.innerWidth;
    const height = window.innerHeight;
    if (width === 0 || height === 0) return;
    rootRef.current.style.setProperty('--glow-x', `${(event.clientX / width) * 100}%`);
    rootRef.current.style.setProperty('--glow-y', `${(event.clientY / height) * 100}%`);
  };

  return (
    <div ref={rootRef} onMouseMove={onMove} className="rt-landing min-h-screen text-rt-ink">
      <div className="rt-landing-glow" aria-hidden="true" />
      <div className="rt-landing-grain" aria-hidden="true" />
      <div className="relative z-10">
        <LandingNav />
        <main>
          <Hero />
          <HowItRuns />
          <PinboardBeat />
          <VotingBeat />
          <AssistantBeat />
          <RecapBeat />
          <FinalCta />
        </main>
        <LandingFooter />
      </div>
    </div>
  );
}
