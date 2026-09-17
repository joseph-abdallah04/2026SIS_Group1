import { DecideBeat } from './DecideBeat';
import { Hero } from './Hero';
import { LandingFooter } from './LandingFooter';
import { LandingNav } from './LandingNav';
import { PinboardBeat } from './PinboardBeat';
import { SitDown } from './SitDown';
import { WalkAway } from './WalkAway';
import './landing.css';

export function LandingPage() {
  return (
    <div className="rt-landing min-h-screen text-rt-ink">
      <LandingNav />
      <main>
        <Hero />
        <SitDown />
        <PinboardBeat />
        <DecideBeat />
        <WalkAway />
      </main>
      <LandingFooter />
    </div>
  );
}
