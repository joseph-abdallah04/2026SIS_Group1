import { useId } from 'react';

import type { VoiceStatus } from './useVoiceRoom';

interface VoiceReconnectProps {
  status: VoiceStatus;
  /** Why voice gave up. The banner says it once; this keeps it on hover. */
  error: string | null;
  retry: () => void;
}

/**
 * Voice has given up (F11): the indicator and the Reconnect that stay in the
 * header once `VoiceNotice`'s banner has stepped aside.
 *
 * It has to exist before the banner can go. `failed` is terminal —
 * `useVoiceRoom` stops retrying after its backoff, even once the network is
 * back — and the banner used to be the only thing that could call `retry`, so
 * letting it go alone would take the only way back into the call with it.
 *
 * It takes the mic toggle's place, and the toggle steps aside while it is
 * here: greyed out, a mute button reads as "you are muted", when what happened
 * is that the room dropped you. Renders nothing in any other state — including
 * `unavailable`, which has no room to reconnect to, and the `idle` a duplicate
 * tab leaves behind, where reconnecting would pull the audio back from the
 * other tab.
 *
 * Dressed like the join code beside it, a white chip with a text action, so
 * it reads as part of the header rather than a second banner.
 */
export function VoiceReconnect({ status, error, retry }: VoiceReconnectProps) {
  const reasonId = useId();
  if (status !== 'failed') return null;

  return (
    <div
      title={error ?? undefined}
      className="flex h-6 shrink-0 items-center gap-2 rounded-full border border-rt-secondary/25 bg-white px-2.5 shadow-sm"
    >
      {/* Red, like the muted mic: both are the state that costs you the
          meeting if you miss it. */}
      <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full bg-red-500" />
      <span className="text-[10.5px] font-medium whitespace-nowrap text-rt-ink-muted">
        Voice offline
      </span>
      {error ? (
        <span id={reasonId} className="sr-only">
          {error}
        </span>
      ) : null}
      <button
        type="button"
        onClick={retry}
        // "Reconnect" alone is ambiguous in a header that also carries the
        // board's own live/offline state; the visible word stays at the front
        // so a voice command naming it still lands.
        aria-label="Reconnect voice"
        aria-describedby={error ? reasonId : undefined}
        className="rounded-full text-[10.5px] leading-none font-semibold text-rt-primary-deep hover:opacity-70 focus-visible:ring-2 focus-visible:ring-rt-secondary focus-visible:ring-offset-2 focus-visible:outline-none"
      >
        Reconnect
      </button>
    </div>
  );
}
