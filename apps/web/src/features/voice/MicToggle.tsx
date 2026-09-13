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
export function MicToggle({ name, micEnabled, micStatus, status, busy, toggle }: MicToggleProps) {
  // Nothing to mute until we are in the room. `reconnecting` counts as out:
  // the SDK queues the change and it lands whenever, which is worse than
  // saying "not now".
  const connected = status === 'connected';
  const disabled = !connected || busy;

  const onToggle = useCallback(() => void toggle(), [toggle]);
  useMicShortcut(onToggle, !disabled);

  const label = name && name.length > 0 ? name : 'You';
  const action = micEnabled ? 'Mute your microphone' : 'Unmute your microphone';

  const title = !connected
    ? 'Voice is not connected'
    : busy
      ? 'Working…'
      : micStatus === 'blocked'
        ? 'Your browser is blocking the microphone — allow it in site settings, then press M'
        : micStatus === 'no-device'
          ? 'No microphone was found — press M to look again'
          : `${action} (M)`;

  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={disabled}
      // Pressed means muted: the button's job is muting, and a screen reader
      // reading "Mute, pressed" alongside the label below is unambiguous.
      aria-pressed={!micEnabled}
      aria-label={`${label} — microphone ${micEnabled ? 'on' : 'muted'}. ${action}.`}
      aria-busy={busy}
      title={title}
      // Square and sized to the header's content band, so it sits level with
      // the chips beside it and the roster's 24px bubbles without making the
      // header any taller.
      className={`flex size-6 shrink-0 items-center justify-center rounded-full border shadow-sm transition-colors focus-visible:ring-2 focus-visible:ring-rt-secondary focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50 ${
        micEnabled
          ? // Grey, and quiet: a live microphone is the state you do not need
            // to be told about. `rt-ink-muted` rather than `rt-ink-faint`,
            // which is too light to read at 13px.
            'border-rt-secondary/25 bg-white text-rt-ink-muted hover:bg-rt-secondary-wash'
          : // Red fill, not merely a red icon: muted is the state that costs
            // you the meeting if you miss it, and a lone red glyph among five
            // white chips is easy to miss. Same red the app already spends on
            // destructive actions (End session, Remove proposal).
            'border-red-300 bg-red-50 text-red-700 hover:bg-red-100'
      }`}
    >
      {micEnabled ? (
        <Mic aria-hidden="true" size={13} strokeWidth={2} />
      ) : (
        // A mic with a slash through it — the muted icon the ticket asks for.
        <MicOff aria-hidden="true" size={13} strokeWidth={2} />
      )}
    </button>
  );
}
