import { ChevronRight } from 'lucide-react';

import { RoundTableLogo } from '../../../components/RoundTableLogo';

interface SetupHeaderProps {
  /** Where the leader is: "New session", "Edit draft". */
  current: string;
  /** How things stand: "Draft", "Not joinable yet". None where the page says it already. */
  status?: string;
  /** The breadcrumb back to the dashboard. The page decides whether to ask first. */
  onDashboard: () => void;
  /** Cancel: back to where the leader came from. None on a page with nothing to cancel. */
  onCancel?: () => void;
}

/**
 * The setup pages' header, in the board's and the lobby's language: 52px of
 * wash, the logo, then where you are as a breadcrumb back to the dashboard.
 * Cancel sits at the right, where the board keeps its way out.
 */
export function SetupHeader({ current, status, onDashboard, onCancel }: SetupHeaderProps) {
  return (
    <header className="flex h-13 shrink-0 items-center gap-3 border-b border-rt-secondary/40 bg-rt-secondary-wash px-3 text-rt-ink sm:px-5">
      <RoundTableLogo className="h-6.5 w-auto shrink-0" />
      <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1.5 text-[13px]">
        <button
          type="button"
          onClick={onDashboard}
          className="shrink-0 rounded-md font-medium text-rt-ink-muted hover:text-rt-ink focus-visible:ring-2 focus-visible:ring-rt-secondary focus-visible:outline-none"
        >
          Dashboard
        </button>
        <ChevronRight aria-hidden size={13} className="shrink-0 text-rt-secondary-deep/50" />
        <h1 aria-current="page" className="truncate font-semibold">
          {current}
        </h1>
      </nav>
      {status ? (
        <span className="hidden items-center gap-1.5 text-[11.5px] whitespace-nowrap text-rt-ink-muted sm:inline-flex">
          <span aria-hidden className="size-1.5 rounded-full bg-[#c9bfae]" />
          {status}
        </span>
      ) : null}
      <span aria-hidden className="min-w-3 flex-1" />
      {onCancel ? (
        <button
          type="button"
          onClick={onCancel}
          className="h-8 shrink-0 rounded-full px-3 text-[12.5px] font-semibold text-rt-ink-muted hover:bg-rt-ink/[0.06] hover:text-rt-ink focus-visible:ring-2 focus-visible:ring-rt-secondary focus-visible:outline-none"
        >
          Cancel
        </button>
      ) : null}
    </header>
  );
}
