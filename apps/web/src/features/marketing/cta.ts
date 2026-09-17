const BASE =
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-full px-5 text-[13px] font-semibold transition-[background-color,color,box-shadow,transform] duration-200 focus-visible:ring-2 focus-visible:ring-rt-secondary focus-visible:ring-offset-2 focus-visible:outline-none';

export const ctaPrimary = `${BASE} bg-rt-secondary text-rt-ink shadow-[0_8px_20px_rgba(224,163,60,0.28)] hover:-translate-y-0.5 hover:bg-rt-secondary-deep hover:text-white hover:shadow-[0_12px_26px_rgba(122,106,76,0.26)]`;

export const ctaGhost = `${BASE} border border-rt-secondary/30 bg-white/70 text-rt-ink hover:border-rt-secondary/60 hover:bg-white`;

export const eyebrow =
  'text-[11px] font-semibold tracking-[0.18em] text-rt-secondary-deep uppercase';

export const sectionHeading =
  'mt-4 font-serif text-[2.05rem] leading-[1.1] font-bold tracking-tight text-rt-ink sm:text-[2.75rem]';

export const sectionBody = 'mt-5 text-[15.5px] leading-relaxed text-rt-ink-muted';
