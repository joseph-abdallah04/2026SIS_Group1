import { AssistantBeat } from './AssistantBeat';
import { FinalCta } from './FinalCta';
import { Hero } from './Hero';
import { HowItRuns } from './HowItRuns';
import { LandingFooter } from './LandingFooter';
import { LandingNav } from './LandingNav';
import { PinboardBeat } from './PinboardBeat';
import { RecapBeat } from './RecapBeat';
import { VotingBeat } from './VotingBeat';
import './landing.css';

export function LandingPage() {
  return (
    <div className="rt-landing min-h-screen text-rt-ink">
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
  );
}
