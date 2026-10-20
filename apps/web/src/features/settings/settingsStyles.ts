// The look the settings panels share: white cards on the page, a sentence-case
// label over each field, a quiet line of help under it.

export const SETTINGS_CARD = 'rounded-3xl border border-rt-tertiary/70 bg-rt-surface p-6 sm:p-8';

export const SETTINGS_CARD_TITLE = 'text-[19px] font-semibold tracking-[-0.01em] text-rt-ink';

export const FIELD = 'flex flex-col gap-2 text-[13.5px] font-semibold text-rt-ink';

export const FIELD_HINT = 'mt-2 text-[12.5px] font-normal text-rt-ink-muted';

export const TEXT_INPUT =
  'block w-full rounded-xl border border-rt-tertiary bg-rt-surface px-4 py-3 text-[14px] font-normal text-rt-ink placeholder:text-rt-ink-faint transition-[border-color,box-shadow] focus:border-rt-secondary focus:ring-2 focus:ring-rt-secondary/30 focus:outline-none';

export const PRIMARY_BUTTON =
  'inline-flex min-h-11 cursor-pointer items-center justify-center rounded-full bg-rt-secondary px-5 text-[14px] font-semibold text-rt-ink transition-colors hover:bg-rt-secondary-deep hover:text-white focus-visible:ring-2 focus-visible:ring-rt-secondary focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:bg-rt-surface-alt disabled:text-rt-ink-faint';

export const SECONDARY_BUTTON =
  'inline-flex min-h-11 cursor-pointer items-center justify-center rounded-full border border-rt-tertiary bg-rt-surface px-5 text-[14px] font-semibold text-rt-ink transition-colors hover:bg-rt-surface-alt focus-visible:ring-2 focus-visible:ring-rt-secondary focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50';
