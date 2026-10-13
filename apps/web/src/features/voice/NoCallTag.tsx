/**
 * The leader created this session with no call, so there is no microphone,
 * banner or roster to show. This sits where the mic would be so that missing
 * them reads as a choice rather than something broken.
 *
 * Dressed like `VoiceReconnect`'s chip, minus the red dot: nothing is wrong.
 */
export function NoCallTag() {
  return (
    <span
      title="The leader set up this session without a call. Everyone works on the board."
      className="flex h-6 shrink-0 items-center rounded-full border border-rt-secondary/25 bg-white px-2.5 text-[10.5px] font-medium whitespace-nowrap text-rt-ink-muted shadow-sm"
    >
      No call
    </span>
  );
}
