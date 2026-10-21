/**
 * The summary's buttons in the header (Review boards, Download PDF): white
 * pills edged in amber on the wash, the main one filled. On a phone only the
 * icon is left, in a 32px circle, so the bar never runs out of room.
 */
export const RECAP_HEADER_BUTTON =
  'inline-flex h-8 min-w-8 shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded-full border px-0 text-[12.5px] font-semibold whitespace-nowrap transition-colors focus-visible:ring-2 focus-visible:ring-rt-secondary focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-wait disabled:opacity-70 sm:px-3';

export const RECAP_HEADER_BUTTON_SECONDARY =
  'border-rt-secondary/45 bg-white text-rt-ink hover:border-rt-secondary hover:bg-[#fffaf1]';

export const RECAP_HEADER_BUTTON_PRIMARY =
  'border-rt-secondary bg-rt-secondary text-rt-ink hover:enabled:border-rt-secondary-deep hover:enabled:bg-rt-secondary-deep hover:enabled:text-white';
