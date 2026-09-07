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
 * The mute button (F12), and the one place your own name is shown in a session.
 *
 * Deliberately one control rather than a button beside a name badge: the
 * ticket wants your mic state visible wherever your name appears, and in the
 * board view that is here — so the name carries the state instead of repeating
 * it two pills apart. F13's participant list extends the same reading to
 * everyone else, from `useVoiceRoom`'s `participants`.
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
      className={`flex max-w-[190px] items-center gap-[7px] rounded-full border px-3 py-1 shadow-sm transition-colors focus-visible:ring-2 focus-visible:ring-rt-secondary focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50 ${
        micEnabled
          ? 'border-rt-secondary/25 bg-white text-rt-secondary-deep hover:bg-rt-secondary-wash'
          : // Red, not merely grey: muted is the state that costs you the
            // meeting if you miss it. Same red the app already spends on
            // destructive actions (End session, Remove proposal).
            'border-red-300 bg-red-50 text-red-700 hover:bg-red-100'
      }`}
    >
      {micEnabled ? (
        <Mic aria-hidden="true" size={14} strokeWidth={2} />
      ) : (
        // A mic with a slash through it — the muted icon the ticket asks for.
        <MicOff aria-hidden="true" size={14} strokeWidth={2} />
      )}
      <span className="truncate text-[10.5px] font-semibold">{label}</span>
      <span className="hidden text-[10.5px] font-semibold opacity-70 sm:inline">
        · {micEnabled ? 'Mic on' : 'Muted'}
      </span>
    </button>
  );
}
