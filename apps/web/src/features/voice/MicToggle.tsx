import { useCallback } from 'react';
import { Mic, MicOff } from 'lucide-react';

import { useMicShortcut } from './useMicShortcut';
import type { MicStatus, VoiceStatus } from './useVoiceRoom';

interface MicToggleProps {
  /** Your display name, once the room knows it. Falls back to "You". */
  name: string | null;
  /** False while muted, including when muted means "never published". */
  micEnabled: boolean;
  micStatus: MicStatus;
  /** The connection, not the microphone: you cannot mute into a room you left. */
  status: VoiceStatus;
  /** A toggle is in flight; a second one would race it. */
  busy: boolean;
  toggle: () => void | Promise<void>;
  /** 32px for the board header, which is shorter than the waiting room's. */
  compact?: boolean;
}

/**
 * The mute button (F12) — the symbol alone.
 *
 * It used to carry your display name and the state in words, because F12 wanted
 * the mic state visible wherever your name appeared and this was the only place
 * your name appeared on the board. F13.2's roster chip names you now, so the
 * name here had become a second copy of something said a few pixels away.
 *
 * Losing the words does not lose the state, which is the thing worth being
 * careful about: muted is what costs you the meeting if you miss it. The chip
 * keeps its red fill rather than tinting the icon alone, and your own bubble in
 * the roster carries the same red-slash badge — so it is signalled twice, in
 * two places you are already looking.
 *
 * With no visible text the `aria-label` is the button's only name, so it still
 * spells out whose microphone this is and what pressing it will do.
 */
export function MicToggle({
  name,
  micEnabled,
  micStatus,
  status,
  busy,
  toggle,
  compact = false,
}: MicToggleProps) {
  // Nothing to mute until we are in the room. `reconnecting` counts as out:
  // the SDK queues the change and it lands whenever, which is worse than
  // saying "not now".
  const connected = status === 'connected';
  const disabled = !connected || busy;

  const onToggle = useCallback(() => void toggle(), [toggle]);
  useMicShortcut(onToggle, !disabled);

  // Voice is not configured on this server, so there is no microphone to
  // offer. Hiding beats a permanently greyed button that explains nothing.
  // Guarded here rather than at each call site so no caller has to remember.
  //
  // `failed` too: `VoiceReconnect` takes this spot until voice is back, and a
  // greyed mute button beside it would say "muted" when what happened is that
  // the room dropped you.
  if (status === 'unavailable' || status === 'failed') return null;

  const label = name && name.length > 0 ? name : 'You';
  const action = micEnabled ? 'Mute your microphone' : 'Unmute your microphone';
  // A mic the browser refused, or one that is not there, draws the same red as
  // a mic you switched off. Once `VoiceNotice`'s banner has stepped aside this
  // button is the only thing left that knows the difference, so it says so: a
  // mark on the chip, and the words for a screen reader.
  const problem =
    micStatus === 'blocked'
      ? 'blocked by your browser'
      : micStatus === 'no-device'
        ? 'not found'
        : null;

  const title = !connected
    ? 'Voice is not connected'
    : busy
      ? 'Working…'
      : micStatus === 'blocked'
        ? 'Your browser is blocking the microphone. Allow it in site settings, then press M'
        : micStatus === 'no-device'
          ? 'No microphone was found. Press M to look again'
          : `${action} (M)`;

  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={disabled}
      // Pressed means muted: the button's job is muting, and a screen reader
      // reading "Mute, pressed" alongside the label below is unambiguous.
      aria-pressed={!micEnabled}
      aria-label={`${label}: microphone ${problem ?? (micEnabled ? 'on' : 'muted')}. ${action}.`}
      aria-busy={busy}
      title={title}
      // A 36px round button (32px compact) with a 16px icon. The border is
      // always there, transparent when muted, so switching never shifts it.
      className={`relative flex ${compact ? 'size-8' : 'size-9'} shrink-0 items-center justify-center rounded-full border transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#DFA243] disabled:cursor-not-allowed disabled:opacity-50 ${
        micEnabled
          ? // Quiet: a live microphone is the state you do not need to be told
            // about.
            'border-[#D9D4CB] bg-white text-[#1F2328] enabled:hover:bg-[#F2F0EB] enabled:active:bg-[#E6E2DA]'
          : // A soft red fill, not merely a red icon: muted is the state that
            // costs you the meeting if you miss it.
            'border-transparent bg-[#FDECEA] text-[#B42318] enabled:hover:bg-[#FBDCD8] enabled:active:bg-[#F8CFC9]'
      }`}
    >
      {micEnabled ? (
        <Mic aria-hidden="true" size={16} strokeWidth={1.5} />
      ) : (
        // A mic with a slash through it.
        <MicOff aria-hidden="true" size={16} strokeWidth={1.5} />
      )}
      {problem ? (
        // Amber, the banner's "you should do something", ringed in the
        // header's own background so it reads as cut out of the chip.
        <span
          aria-hidden="true"
          data-mic-warning
          className="absolute -top-0.5 -right-0.5 flex size-3.5 items-center justify-center rounded-full bg-rt-secondary text-[8px] leading-none font-bold text-white ring-2 ring-rt-secondary-wash"
        >
          !
        </span>
      ) : null}
    </button>
  );
}
