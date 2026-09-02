import { StickyNote } from 'lucide-react';

import { useCreativeTools } from '../tools/CreativeToolsContext';

export function CreativeToolbar() {
  const { activeTool, isLive, openTool, submissionStatus } = useCreativeTools();
  const disabled = !isLive || submissionStatus === 'submitting';

  return (
    <nav
      aria-label="Creative tools"
      className="flex h-11 items-center rounded-full border border-rt-tertiary bg-rt-surface p-1 shadow-[0_4px_18px_rgba(8,12,21,0.12)]"
    >
      <button
        type="button"
        aria-pressed={activeTool === 'sticky'}
        disabled={disabled}
        onClick={() => openTool('sticky')}
        title={isLive ? 'New sticky note' : 'Reconnect to create a sticky note'}
        className="flex h-9 items-center gap-2 rounded-full px-2.5 text-[12px] font-semibold text-rt-ink-muted transition-colors hover:bg-rt-secondary-wash hover:text-rt-ink focus-visible:ring-2 focus-visible:ring-rt-secondary focus-visible:ring-offset-2 focus-visible:outline-none aria-pressed:bg-rt-secondary-wash aria-pressed:text-rt-ink disabled:cursor-not-allowed disabled:opacity-45 sm:px-3.5"
      >
        <StickyNote aria-hidden="true" size={17} strokeWidth={1.8} />
        <span className="hidden sm:inline">New sticky</span>
      </button>
    </nav>
  );
}
