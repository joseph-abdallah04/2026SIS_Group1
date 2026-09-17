import { eyebrow, sectionBody, sectionHeading } from './cta';
import { LandingRecap } from './LandingRecap';

export function RecapBeat() {
  return (
    <section id="recap" className="scroll-mt-20 border-t border-rt-secondary/15 bg-white/40 py-24">
      <div className="mx-auto grid max-w-6xl items-center gap-14 px-6 lg:grid-cols-[0.9fr_1.1fr] lg:gap-20">
        <div className="max-w-lg">
          <p className={eyebrow}>The recap</p>
          <h2 className={sectionHeading}>The recap is the list of answers.</h2>
          <p className={sectionBody}>
            When the leader ends the session, the call disconnects and the board is frozen. What
            remains is each agenda question paired with the proposal that won it — or marked
            skipped, if the leader moved on without a vote.
          </p>
          <p className="mt-4 text-[15.5px] leading-relaxed text-rt-ink-muted">
            Everyone who was in the room can open it from the dashboard afterwards. There is
            nothing extra to write up.
          </p>
        </div>

        <LandingRecap />
      </div>
    </section>
  );
}
