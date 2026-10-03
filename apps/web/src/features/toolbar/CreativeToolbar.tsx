import type { ReactNode } from 'react';
import { ImagePlus, Palette, StickyNote } from 'lucide-react';

import { useCreativeTools } from '../tools/CreativeToolsContext';
import { useImageImport } from '../tools/image/ImageImportProvider';

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
 * because the agenda rail alone moves the board's width by up to 436px (from its
 * collapsed strip to the widest it can be dragged). Outside that
 * container (the dev workbench, the editor tests) it never matches, so the
 * labels show.
 *
 * 42rem because the right-anchored main bar (~375px) and the zoom control
 * (~181px), with their 24px insets and a 16px gap between, need about 620px.
 * Re-derive it if the labels change.
 */
export const TOOL_LABEL = '@max-[42rem]/board:hidden';

/** Horizontal padding for a labelled tool button, tightened once it is only an icon. */
export const TOOL_BUTTON_PAD = 'px-3.5 @max-[42rem]/board:px-2.5';

/**
 * The widest a bar that shares the bottom row with the zoom control may be: the
 * board less the zoom control, its 24px inset, a 16px gap and the bar's own
 * 24px inset. 18rem leaves room for the labelled zoom control (~181px); below
 * 36rem it is icons only (~125px), so 12rem does.
 */
export const BAR_BESIDE_ZOOM =
  'max-w-[calc(100cqw-18rem)] @max-[36rem]/board:max-w-[calc(100cqw-12rem)]';

/**
 * The board's last stage: too narrow to use, so the floating controls go and a
 * one-line note says why. 24rem because the right-anchored toolbar (~165px as
 * icons) and the zoom control (~125px), with their insets and gap, meet just
 * under 360px. Below this nothing could be pressed without hitting the other,
 * and the board itself is too small to place anything on.
 */
export const BOARD_CRAMPED_HIDDEN = '@max-[24rem]/board:hidden';
/** The note that stands in for the controls on a board that narrow. */
export const BOARD_CRAMPED_ONLY = 'hidden @max-[24rem]/board:flex';

interface CreativeToolbarProps {
  /**
   * More ways to start a proposal, after the two built in — Reuse, today. Taken
   * as children rather than imported so the toolbar does not need to know how
   * an earlier proposal is fetched, and so they sit inside the same pill.
   */
  children?: ReactNode;
}

/**
 * The things anyone can start here: a sticky, a studio canvas, or a picture
 * brought in from elsewhere.
 *
 * The drawing tool has no button any more: the studio draws freehand on the
 * same canvas as everything else, so a separate surface that can only hold
 * strokes was a worse version of a tool already on offer. It is only the button
 * that has gone — drawings already on a board still render, and extending or
 * editing one still opens the editor that made it.
 */
export function CreativeToolbar({ children }: CreativeToolbarProps) {
  const { activeTool, isLive, openTool, submissionStatus } = useCreativeTools();
  // Absent outside a board, where there is nowhere to bring a picture to.
  const imageImport = useImageImport();
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
            ? 'New studio canvas for shapes, arrows and freehand drawing'
            : 'Reconnect to open the studio'
        }
        aria-label="Studio"
        className={`flex h-9 items-center gap-2 rounded-full text-[12px] font-semibold text-rt-ink-muted transition-colors hover:bg-rt-cool-tint hover:text-rt-ink focus-visible:ring-2 focus-visible:ring-rt-cool focus-visible:ring-offset-2 focus-visible:outline-none aria-pressed:bg-rt-cool-tint aria-pressed:text-rt-ink disabled:cursor-not-allowed disabled:opacity-45 ${TOOL_BUTTON_PAD}`}
      >
        <Palette aria-hidden="true" size={17} strokeWidth={1.8} />
        <span className={TOOL_LABEL}>Studio</span>
      </button>
      {imageImport ? (
        <button
          type="button"
          disabled={disabled || !imageImport.canImport}
          onClick={imageImport.pickFile}
          title={
            isLive
              ? 'Add an image, drop one on the board, or paste a screenshot'
              : 'Reconnect to add an image'
          }
          aria-label="Image"
          className={`flex h-9 items-center gap-2 rounded-full text-[12px] font-semibold text-rt-ink-muted transition-colors hover:bg-rt-secondary-wash hover:text-rt-ink focus-visible:ring-2 focus-visible:ring-rt-secondary focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-45 ${TOOL_BUTTON_PAD}`}
        >
          <ImagePlus aria-hidden="true" size={17} strokeWidth={1.8} />
          <span className={TOOL_LABEL}>Image</span>
        </button>
      ) : null}
      {children ? (
        <>
          <span aria-hidden="true" className="mx-1 h-5 w-px bg-rt-tertiary" />
          {children}
        </>
      ) : null}
    </nav>
  );
}
