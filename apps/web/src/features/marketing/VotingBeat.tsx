import { eyebrow, sectionBody, sectionHeading } from './cta';
import { LandingBallot } from './LandingBallot';

export function VotingBeat() {
  return (
    <section id="voting" className="scroll-mt-20 border-t border-rt-secondary/15 bg-white/40 py-24">
      <div className="mx-auto grid max-w-6xl items-center gap-14 px-6 lg:grid-cols-2 lg:gap-20">
        <div className="order-2 lg:order-1">
          <LandingBallot />
        </div>

        <div className="order-1 max-w-lg lg:order-2">
          <p className={eyebrow}>Voting</p>
          <h2 className={sectionHeading}>The leader shortlists. Everyone votes once.</h2>
          <p className={sectionBody}>
            When discussion has gone far enough, the leader chooses which proposals are worth
            deciding between. Each person in the room casts one private vote, including the leader.
          </p>
          <p className="mt-4 text-[15.5px] leading-relaxed text-rt-ink-muted">
            The leader can see who still needs to vote, never what they picked. You can change your
            mind until they end the round — or until the timer does. The running tally is on the
            cards while voting is open. When they close, the winning proposal is written down as
            that question’s answer, and they continue.
          </p>
        </div>
      </div>
    </section>
  );
}
