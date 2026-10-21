import { ArrowLeft, ChevronRight, Download, LayoutDashboard } from 'lucide-react';

import { RoundTableLogo } from '../../components/RoundTableLogo';
import {
  RECAP_HEADER_BUTTON,
  RECAP_HEADER_BUTTON_PRIMARY,
  RECAP_HEADER_BUTTON_SECONDARY,
} from '../summary/recapButtons';
import { SessionSummaryView } from '../summary/SessionSummaryView';
import { DEMO_RECAP } from './story';

/**
 * The ended-session recap, using the real summary view under a drawing of
 * the summary page's bar: the trail back to the dashboard, Review boards and
 * Download PDF. Decorative: nothing here downloads, opens or links anywhere,
 * so the bar's pieces are drawn rather than made of the real controls.
 */
export function LandingRecap({ compact = false }: { compact?: boolean }) {
  return (
    <div
      className="overflow-hidden rounded-2xl border border-rt-secondary/40 bg-rt-surface text-rt-ink shadow-[0_28px_70px_rgba(122,106,76,0.14)]"
      aria-hidden="true"
      {...{ inert: '' }}
    >
      <div className="flex h-13 shrink-0 items-center gap-2 border-b border-rt-secondary/40 bg-rt-secondary-wash px-3 sm:gap-3 sm:px-5">
        <RoundTableLogo className="h-6.5 w-auto shrink-0" />
        <span className="flex min-w-0 items-center gap-1.5 text-[13px]">
          <span className="font-medium text-rt-ink-muted">Dashboard</span>
          <ChevronRight size={13} className="hidden shrink-0 text-rt-secondary-deep/50 sm:block" />
          <span className="hidden truncate font-semibold sm:block">Recap</span>
        </span>
        <span className="min-w-2 flex-1" />
        <span className={`${RECAP_HEADER_BUTTON} ${RECAP_HEADER_BUTTON_SECONDARY}`}>
          <LayoutDashboard size={15} strokeWidth={2} />
          <span className="hidden sm:inline">Review boards</span>
        </span>
        <span className={`${RECAP_HEADER_BUTTON} ${RECAP_HEADER_BUTTON_PRIMARY}`}>
          <Download size={15} strokeWidth={2} />
          <span className="hidden sm:inline">Download PDF</span>
        </span>
      </div>

      <div className={`relative ${compact ? 'max-h-112' : 'max-h-152'} overflow-hidden`}>
        <div className="flex flex-col gap-6 px-5 py-6 sm:px-8 sm:py-7">
          <span className="flex items-center gap-2 text-[13.5px] font-medium text-rt-ink-muted">
            <ArrowLeft size={15} />
            Back to dashboard
          </span>
          <SessionSummaryView summary={DEMO_RECAP} viewerId={null} voiceEnabled />
        </div>
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-linear-to-t from-rt-surface to-transparent"
        />
      </div>
    </div>
  );
}
