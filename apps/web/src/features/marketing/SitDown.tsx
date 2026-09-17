import { FadeUp } from './FadeUp';
import { RoundTableScene } from './RoundTableScene';

const LOBBY_SEATS = [
  { name: 'Amina', leader: true, speaking: true },
  { name: 'Ben' },
  { name: 'Chi' },
  { name: 'Dee' },
  { name: 'Eli' },
  { name: 'Faye' },
] as const;

export function SitDown() {
  return (
    <section className="mx-auto grid max-w-6xl items-center gap-12 px-6 py-24 md:grid-cols-2">
      <FadeUp>
        <p className="text-[11px] font-semibold tracking-[0.16em] text-rt-secondary-deep uppercase">
          The lobby
        </p>
        <h2 className="mt-3 font-serif text-4xl font-bold tracking-tight text-rt-ink md:text-5xl">
          Sit down. Voice is already on.
        </h2>
        <p className="mt-4 max-w-md text-[16px] leading-relaxed text-rt-ink-muted">
          The leader shares a code. Teammates take a seat around the table. You are talking before
          the pinboard even opens.
        </p>
      </FadeUp>
      <FadeUp delay={0.1} className="rt-landing-scene mx-auto w-full max-w-md">
        <RoundTableScene seats={LOBBY_SEATS} showNames />
      </FadeUp>
    </section>
  );
}
