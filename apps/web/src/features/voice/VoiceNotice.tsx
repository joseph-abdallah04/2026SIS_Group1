import { useEffect, useState } from 'react';

import type { MicStatus, VoiceStatus } from './useVoiceRoom';

/**
 * How long a notice that can step aside stays up.
 *
 * Longer than the board's own 4–5s one-liners — "Alice joined", "Copied to
 * clipboard" — because each of these is a sentence and a button, and the
 * longest, the site-settings directions for a blocked mic, needs most of this
 * to read.
 */
export const NOTICE_AUTO_HIDE_MS = 8_000;

interface VoiceNoticeProps {
  status: VoiceStatus;
  micStatus: MicStatus;
  /** True once the browser confirms the block is permanent — see useVoiceRoom. */
  micPermissionDenied: boolean;
  error: string | null;
  audioBlocked: boolean;
  retry: () => void;
  requestMicrophone: () => void | Promise<void>;
  unlockAudio: () => void | Promise<void>;
}

interface Notice {
  /**
   * Which condition this is. The banner is keyed on it, so a fresh occurrence
   * — a Reconnect that fails again, a mic retried and refused again — starts
   * its timer over, while a re-render of the same one keeps counting. Both
   * mic-blocked wordings share one: the Permissions API refines the first into
   * the second a moment after it appears, and that is not a new problem.
   */
  id: 'sound-blocked' | 'offline' | 'mic-blocked' | 'no-device' | 'reconnecting';
  label: string;
  message: string;
  action?: { label: string; run: () => void | Promise<void> };
  /** Amber for "you should do something", grey for "we are working on it". */
  tone: 'attention' | 'quiet';
  /**
   * Steps aside after `NOTICE_AUTO_HIDE_MS`. Only ever set where something
   * that stays on screen carries the state and the action on from here — a
   * banner that is not coming back cannot take the only way out with it.
   */
  autoHide: boolean;
}

/**
 * Everything that can be wrong with voice, in priority order.
 *
 * Returning one notice rather than stacking them is the point: a blocked mic
 * and a reconnect are both true at once often enough, and two banners fighting
 * for the top of the board reads as breakage rather than information.
 */
function currentNotice(props: VoiceNoticeProps): Notice | null {
  const {
    status,
    micStatus,
    micPermissionDenied,
    error,
    audioBlocked,
    retry,
    requestMicrophone,
    unlockAudio,
  } = props;

  // A server with no LiveKit credentials has nothing to say about the room.
  // Checked before everything else because `micStatus` can still be a stale
  // `blocked` from an earlier connected period, which would otherwise raise a
  // microphone banner about a room that no longer exists.
  if (status === 'unavailable') return null;

  // Nothing to hear beats nothing to say: if the browser is holding audio back,
  // the room is silent no matter what the microphone is doing.
  if (audioBlocked) {
    return {
      id: 'sound-blocked',
      tone: 'attention',
      label: 'Sound blocked',
      message: 'Your browser is holding back audio from this page until you interact with it.',
      action: { label: 'Enable sound', run: unlockAudio },
      // Stays: nothing else on screen says why the room has gone silent, and
      // the fix is one click away.
      autoHide: false,
    };
  }

  if (status === 'failed') {
    return {
      id: 'offline',
      tone: 'attention',
      label: 'Voice offline',
      message: error ?? 'Could not connect to voice for this session.',
      action: { label: 'Reconnect', run: retry },
      // `VoiceReconnect` keeps the state and the button in the header.
      autoHide: true,
    };
  }

  if (micStatus === 'blocked') {
    // Once a browser treats a mic denial as permanent, it will never show the
    // permission prompt again for a page to retry into — that decision can
    // only be undone in the browser's own site settings. Telling someone to
    // "try again" in that state describes a button that cannot work.
    //
    // Both wordings step aside: the mic toggle keeps a warning mark, the
    // directions in its tooltip, and a press that asks again. Voice is
    // optional, so someone who declined on purpose would otherwise be told
    // "nobody can hear you" for the whole session with no way to dismiss it.
    return micPermissionDenied
      ? {
          id: 'mic-blocked',
          tone: 'attention',
          label: 'Mic blocked',
          message:
            'You can hear everyone, but nobody can hear you. Your browser has blocked the microphone for this site — open the site settings from your address bar (usually the padlock icon) and allow it there.',
          action: { label: 'Recheck', run: requestMicrophone },
          autoHide: true,
        }
      : {
          id: 'mic-blocked',
          tone: 'attention',
          label: 'Mic blocked',
          // Says what is still true — you can hear the room — so this reads
          // as a partial state rather than a dead session (docs/06: voice is
          // optional).
          message:
            'You can hear everyone, but nobody can hear you. Allow microphone access in your browser, then try again.',
          action: { label: 'Try again', run: requestMicrophone },
          autoHide: true,
        };
  }

  if (micStatus === 'no-device') {
    return {
      id: 'no-device',
      tone: 'attention',
      label: 'No microphone',
      message: 'No working microphone was found. You can still hear the session.',
      action: { label: 'Check again', run: requestMicrophone },
      // Same hand-off as a blocked mic: the toggle keeps the mark and the retry.
      autoHide: true,
    };
  }

  if (status === 'reconnecting') {
    return {
      id: 'reconnecting',
      tone: 'quiet',
      label: 'Voice',
      message: 'Reconnecting to the room…',
      // Ends by itself: you are back in, or it becomes `offline`.
      autoHide: false,
    };
  }

  return null;
}

/**
 * F11's banner. Silent while voice is healthy — the mic toggle is F12 and the
 * participant list is F13, so a working call shows nothing here rather than a
 * status badge nobody needs.
 *
 * Most notices step aside after a few seconds (`Notice.autoHide`) instead of
 * holding the top of the page for as long as the problem lasts, which can be
 * the rest of the session: `failed` is terminal, and a declined mic is a
 * choice. What they said stays in the header — `VoiceReconnect`, and the mic
 * toggle's warning mark.
 */
export function VoiceNotice(props: VoiceNoticeProps) {
  const notice = currentNotice(props);
  if (!notice) return null;

  // Keyed on the condition: a new occurrence remounts the banner, which is
  // the whole of resetting its timer.
  return <NoticeBanner key={notice.id} notice={notice} />;
}

/**
 * One notice on screen, and its timer.
 *
 * Expiring renders nothing — deliberately not the next notice down the list.
 * `micStatus` can still hold a `blocked` from before a drop, so falling
 * through from an expired `offline` would raise "Mic blocked" about a room you
 * are no longer in: the same stale value the `unavailable` check guards
 * against.
 */
function NoticeBanner({ notice }: { notice: Notice }) {
  const [expired, setExpired] = useState(false);
  // Held while the pointer is on it or focus is in it: someone is reading it,
  // or reaching for its button, and pulling it out from under them would lose
  // the click. Letting go starts the count again from the top rather than
  // resuming it — whoever went to the banner was in the middle of reading it.
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const held = hovered || focused;

  useEffect(() => {
    if (!notice.autoHide || held) return;
    const timer = setTimeout(() => setExpired(true), NOTICE_AUTO_HIDE_MS);
    return () => clearTimeout(timer);
  }, [notice.autoHide, held]);

  if (expired) return null;

  const attention = notice.tone === 'attention';

  return (
    // `z-30`, and last in the board's markup: a vote's scrim is `z-30` too, and
    // voice trouble is not the board's to cover — "Sound blocked" behind it
    // would be a silent room and a button nobody can press.
    <div className="pointer-events-none absolute inset-x-0 top-3 z-30 flex justify-center px-4">
      <div
        role="status"
        onPointerEnter={() => setHovered(true)}
        onPointerLeave={() => setHovered(false)}
        onFocus={() => setFocused(true)}
        onBlur={(event) => {
          // Focus moving between things inside the banner is still focus on it.
          if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false);
        }}
        className={`pointer-events-auto flex max-w-[560px] items-center gap-3 rounded-2xl border px-3.5 py-2.5 shadow-sm ${
          attention
            ? 'border-rt-secondary-tint bg-rt-secondary-wash'
            : 'border-rt-tertiary bg-rt-surface'
        }`}
      >
        <span
          className={`shrink-0 text-[9px] font-semibold tracking-[0.16em] uppercase ${
            attention ? 'text-rt-secondary-deep' : 'text-rt-ink-faint'
          }`}
        >
          {notice.label}
        </span>
        <p className="text-[12.5px] leading-relaxed text-rt-ink">{notice.message}</p>
        {notice.action ? (
          <button
            type="button"
            onClick={() => void notice.action?.run()}
            className="ml-1 shrink-0 rounded-full bg-rt-primary px-3 py-1.5 text-[11.5px] font-semibold text-white hover:opacity-90 focus:outline focus:outline-2 focus:outline-offset-2 focus:outline-rt-primary"
          >
            {notice.action.label}
          </button>
        ) : null}
      </div>
    </div>
  );
}
