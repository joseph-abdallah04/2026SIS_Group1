import { Download } from 'lucide-react';

import { RoundTableLogo } from '../../components/RoundTableLogo';
import { SessionSummaryView } from '../summary/SessionSummaryView';
import { DEMO_RECAP } from './story';

/**
 * The ended-session recap, using the real summary view and the same header /
 * download chrome as `SessionEndedPage`. Decorative: nothing here downloads.
 */
export function LandingRecap({ compact = false }: { compact?: boolean }) {
  return (
    <div
      className="overflow-hidden rounded-2xl border border-rt-secondary/40 bg-rt-surface text-rt-ink shadow-[0_28px_70px_rgba(122,106,76,0.14)]"
      aria-hidden="true"
      {...{ inert: '' }}
    >
      <header className="flex shrink-0 items-center gap-4 border-b border-rt-secondary/40 bg-rt-secondary-wash px-5 py-[13px] sm:px-6">
        <RoundTableLogo />
        <span className="text-[13px] font-semibold tracking-[-0.01em]">Session ended</span>
      </header>

      <div className={`relative ${compact ? 'max-h-[28rem]' : 'max-h-[38rem]'} overflow-hidden`}>
        <div className="flex flex-col gap-6 px-5 py-8 sm:px-6">
          <SessionSummaryView summary={DEMO_RECAP} viewerId={null} />
          <div className="flex items-center justify-between gap-4 pt-2">
            <span className="text-[13px] font-semibold text-rt-primary-deep">Back to dashboard</span>
            <span className="inline-flex min-h-10 items-center justify-center gap-2 rounded-full bg-rt-secondary px-4 text-[13px] font-semibold text-rt-ink shadow-sm">
              <Download aria-hidden="true" size={16} strokeWidth={2} />
              Download Session Summary
            </span>
          </div>
        </div>
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-rt-surface to-transparent"
        />
      </div>
    </div>
  );
}
