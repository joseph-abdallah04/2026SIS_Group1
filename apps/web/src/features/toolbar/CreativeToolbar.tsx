import type { ReactNode } from 'react';
import { Palette, StickyNote } from 'lucide-react';

import { useCreativeTools } from '../tools/CreativeToolsContext';

/**
 * The chrome every bar floating over the board shares: the creative tools, the
 * message that stands in for them while the board is closed, and the zoom
 * control. One string so the three read as one family and sit on one baseline.
 */
export const FLOATING_BAR =
  'flex h-11 items-center rounded-full border border-rt-tertiary bg-rt-surface p-1 shadow-[0_4px_18px_rgba(8,12,21,0.12)]';

/**
 * The floating bars' last stage on a narrow board: text goes and the icons
 * stay. Keyed off the `board` container the pinboard declares, not the window,
 * because the agenda rail alone moves the board's width by 212px. Outside that
 * container (the dev workbench, the editor tests) it never matches, so the
 * labels show.
 *
 * 36rem because the right-anchored main bar (~290px) and the zoom control
 * (~181px), with their 24px insets and a 16px gap between, need about 535px.
 * Re-derive it if the labels change.
 */
export const TOOL_LABEL = '@max-[36rem]/board:hidden';

/** Horizontal padding for a labelled tool button, tightened once it is only an icon. */
export const TOOL_BUTTON_PAD = 'px-3.5 @max-[36rem]/board:px-2.5';

interface CreativeToolbarProps {
  /**
   * More ways to start a proposal, after the two built in — Reuse, today. Taken
   * as children rather than imported so the toolbar does not need to know how
   * an earlier proposal is fetched, and so they sit inside the same pill.
   */
  children?: ReactNode;
}

/**
 * The two things anyone can start here.
 *
 * The drawing tool has no button any more: the studio draws freehand on the
 * same canvas as everything else, so a separate surface that can only hold
 * strokes was a worse version of a tool already on offer. It is only the button
 * that has gone — drawings already on a board still render, and extending or
 * editing one still opens the editor that made it.
 */
export function CreativeToolbar({ children }: CreativeToolbarProps) {
  const { activeTool, isLive, openTool, submissionStatus } = useCreativeTools();
  const disabled = !isLive || submissionStatus === 'submitting';

  return (
    <nav
      // The sticky popup rises from here, so it measures where "here" is.
      data-creative-toolbar
      aria-label="Creative tools"
      className={FLOATING_BAR}
    >
      <button
        type="button"
        aria-pressed={activeTool === 'sticky'}
        disabled={disabled}
        onClick={() => openTool('sticky')}
        title={isLive ? 'New sticky note' : 'Reconnect to create a sticky note'}
        aria-label="Sticky"
        className={`flex h-9 items-center gap-2 rounded-full text-[12px] font-semibold text-rt-ink-muted transition-colors hover:bg-rt-secondary-wash hover:text-rt-ink focus-visible:ring-2 focus-visible:ring-rt-secondary focus-visible:ring-offset-2 focus-visible:outline-none aria-pressed:bg-rt-secondary-wash aria-pressed:text-rt-ink disabled:cursor-not-allowed disabled:opacity-45 ${TOOL_BUTTON_PAD}`}
      >
        <StickyNote aria-hidden="true" size={17} strokeWidth={1.8} />
        <span className={TOOL_LABEL}>Sticky</span>
      </button>
      <button
        type="button"
        aria-pressed={activeTool === 'diagram'}
        disabled={disabled}
        onClick={() => openTool('diagram')}
        title={
          isLive
            ? 'New studio canvas — shapes, arrows and freehand drawing together'
            : 'Reconnect to open the studio'
        }
        aria-label="Studio"
        className={`flex h-9 items-center gap-2 rounded-full text-[12px] font-semibold text-rt-ink-muted transition-colors hover:bg-rt-cool-tint hover:text-rt-ink focus-visible:ring-2 focus-visible:ring-rt-cool focus-visible:ring-offset-2 focus-visible:outline-none aria-pressed:bg-rt-cool-tint aria-pressed:text-rt-ink disabled:cursor-not-allowed disabled:opacity-45 ${TOOL_BUTTON_PAD}`}
      >
        <Palette aria-hidden="true" size={17} strokeWidth={1.8} />
        <span className={TOOL_LABEL}>Studio</span>
      </button>
      {children ? (
        <>
          <span aria-hidden="true" className="mx-1 h-5 w-px bg-rt-tertiary" />
          {children}
        </>
      ) : null}
    </nav>
  );
}
