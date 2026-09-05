import type { MicStatus, VoiceStatus } from './useVoiceRoom';

interface VoiceNoticeProps {
  status: VoiceStatus;
  micStatus: MicStatus;
  error: string | null;
  audioBlocked: boolean;
  retry: () => void;
  requestMicrophone: () => void | Promise<void>;
  unlockAudio: () => void | Promise<void>;
}

interface Notice {
  label: string;
  message: string;
  action?: { label: string; run: () => void | Promise<void> };
  /** Amber for "you should do something", grey for "we are working on it". */
  tone: 'attention' | 'quiet';
}

/**
 * Everything that can be wrong with voice, in priority order.
 *
 * Returning one notice rather than stacking them is the point: a blocked mic
 * and a reconnect are both true at once often enough, and two banners fighting
 * for the top of the board reads as breakage rather than information.
 */
function currentNotice(props: VoiceNoticeProps): Notice | null {
  const { status, micStatus, error, audioBlocked, retry, requestMicrophone, unlockAudio } = props;

  // Nothing to hear beats nothing to say: if the browser is holding audio back,
  // the room is silent no matter what the microphone is doing.
  if (audioBlocked) {
    return {
      tone: 'attention',
      label: 'Sound blocked',
      message: 'Your browser is holding back audio from this page until you interact with it.',
      action: { label: 'Enable sound', run: unlockAudio },
    };
  }

  if (status === 'failed') {
    return {
      tone: 'attention',
      label: 'Voice offline',
      message: error ?? 'Could not connect to voice for this session.',
      action: { label: 'Reconnect', run: retry },
    };
  }

  if (micStatus === 'blocked') {
    return {
      tone: 'attention',
      label: 'Mic blocked',
      // Says what is still true — you can hear the room — so this reads as a
      // partial state rather than a dead session (docs/06: voice is optional).
      message:
        'You can hear everyone, but nobody can hear you. Allow microphone access in your browser, then try again.',
      action: { label: 'Try again', run: requestMicrophone },
    };
  }

  if (micStatus === 'no-device') {
    return {
      tone: 'attention',
      label: 'No microphone',
      message: 'No working microphone was found. You can still hear the session.',
      action: { label: 'Check again', run: requestMicrophone },
    };
  }

  if (status === 'reconnecting') {
    return {
      tone: 'quiet',
      label: 'Voice',
      message: 'Reconnecting to the room…',
    };
  }

  return null;
}

/**
 * The one piece of voice UI F11 owns. Silent while voice is healthy — the mic
 * toggle is F12 and the participant list is F13, so a working call shows
 * nothing here rather than a status badge nobody needs.
 */
export function VoiceNotice(props: VoiceNoticeProps) {
  const notice = currentNotice(props);
  if (!notice) return null;

  const attention = notice.tone === 'attention';

  return (
    <div className="pointer-events-none absolute inset-x-0 top-3 z-20 flex justify-center px-4">
      <div
        role="status"
        className={`pointer-events-auto flex max-w-[560px] items-center gap-3 border px-3.5 py-2.5 shadow-sm ${
          attention
            ? 'border-rt-secondary-tint bg-rt-secondary-wash'
            : 'border-rt-tertiary bg-rt-surface'
        }`}
        style={{ borderRadius: '12px' }}
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
            className="ml-1 shrink-0 bg-rt-primary px-3 py-1.5 text-[11.5px] font-semibold text-white hover:opacity-90 focus:outline focus:outline-2 focus:outline-offset-2 focus:outline-rt-primary"
            style={{ borderRadius: '8px' }}
          >
            {notice.action.label}
          </button>
        ) : null}
      </div>
    </div>
  );
}
