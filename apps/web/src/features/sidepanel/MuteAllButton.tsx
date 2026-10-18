import { MicOff } from 'lucide-react';

import { MUTE_ALL, type LeaderMute } from '../voice';

const BUTTON =
  'ml-1 inline-flex h-[26px] items-center gap-1.5 rounded-full border border-rt-tertiary bg-white px-2.5 text-[11px] font-semibold whitespace-nowrap text-rt-ink-muted transition-colors enabled:hover:border-[#b42318]/35 enabled:hover:text-[#b42318] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rt-secondary disabled:cursor-default disabled:opacity-45';

/**
 * The leader's "Mute all", in the People panel's header beside its collapse
 * arrow: every microphone that is on, except the leader's own.
 *
 * No confirmation. Muting is undone by each person pressing their own mic,
 * which is less than a dialog would cost the leader every time.
 */
export function MuteAllButton({
  moderation,
  anyoneToMute,
}: {
  moderation: LeaderMute;
  /** Someone besides the leader has their microphone on. */
  anyoneToMute: boolean;
}) {
  const busy = moderation.pending.has(MUTE_ALL);
  return (
    <button
      type="button"
      onClick={() => void moderation.mute()}
      disabled={busy || !anyoneToMute}
      title={anyoneToMute ? 'Mute everyone but you' : 'Nobody else has their microphone on'}
      className={BUTTON}
    >
      <MicOff aria-hidden="true" size={12} strokeWidth={2} />
      {busy ? 'Muting…' : 'Mute all'}
    </button>
  );
}
