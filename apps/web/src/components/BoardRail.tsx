import type { ReactNode, Ref } from 'react';

import { useRailResize } from './useRailResize';

export type BoardRailSide = 'left' | 'right';
/** Agenda column, or the wider one the assistant needs for a conversation. */
export type BoardRailWidth = 'narrow' | 'wide';

const EXPANDED_WIDTH: Record<BoardRailWidth, string> = {
  narrow: 'w-64 min-w-64 max-w-64 basis-64',
  wide: 'w-96 min-w-96 max-w-96 basis-96',
};

const TITLE_CLASSES = 'text-[10px] font-semibold tracking-[0.16em] text-rt-ink-faint uppercase';
const TOGGLE_CLASSES =
  'inline-flex items-center justify-center text-[13px] font-semibold text-rt-primary-deep hover:opacity-70';

interface BoardRailProps {
  /** Which edge of the board this dock sits on — flips the border and chevrons. */
  side: BoardRailSide;
  /** Defaults to the agenda column. The assistant asks for `wide`. */
  width?: BoardRailWidth;
  title: string;
  collapsed: boolean;
  onToggle: () => void;
  expandLabel: string;
  collapseLabel: string;
  expandTitle?: string;
  collapseTitle?: string;
  /** Strip-only extras (a status mark). Omitted on a rail that has none. */
  collapsedExtra?: ReactNode;
  /** The expand/collapse control, so a caller can hand focus back to it. */
  toggleRef?: Ref<HTMLButtonElement>;
  /**
   * Still in the layout, but not a tab stop or a click target. The ballot
   * covers both rails and keeps this strip so the board does not change width.
   */
  inert?: boolean;
  /**
   * Lets the rail's inner edge be dragged to any width between
   * `RAIL_MIN_WIDTH` and `RAIL_MAX_WIDTH`, and closed by dragging on past the
   * minimum (`useRailResize`). `storageKey` names the remembered width: rails
   * that share one open at the same size. Overrides `width` while set.
   */
  resize?: { storageKey: string; label: string };
  children: ReactNode;
}

function RailTitle({ children, vertical }: { children: ReactNode; vertical?: boolean }) {
  return (
    <span
      className={`${TITLE_CLASSES} ${vertical ? 'leading-none' : ''}`}
      style={vertical ? { writingMode: 'vertical-rl' } : undefined}
    >
      {children}
    </span>
  );
}

/**
 * Shared chrome for the session's left and right docks (agenda, assistant).
 *
 * The two rails are mirrors of one piece: same padding, title and toggle.
 * `side` flips the border and the chevrons. `width` is the expanded column —
 * the agenda stays narrow, the assistant is wide enough to read a chat in.
 * `resize` trades the fixed column for one the user drags to size.
 */
export function BoardRail({
  side,
  width = 'narrow',
  title,
  collapsed,
  onToggle,
  expandLabel,
  collapseLabel,
  expandTitle,
  collapseTitle,
  collapsedExtra,
  toggleRef,
  inert = false,
  resize,
  children,
}: BoardRailProps) {
  const resizer = useRailResize({ side, storageKey: resize?.storageKey, collapsed, onToggle });
  const onLeft = side === 'left';
  const edge = onLeft ? 'border-r' : 'border-l';
  const expandChevron = onLeft ? '›' : '‹';
  const collapseChevron = onLeft ? '‹' : '›';

  if (collapsed) {
    return (
      <aside
        aria-label={title}
        {...(inert ? { inert: '' } : {})}
        className={`box-border flex w-11 min-w-11 max-w-11 shrink-0 grow-0 basis-11 flex-col items-center gap-3 ${edge} border-rt-tertiary bg-rt-surface-alt py-3`}
      >
        <button
          ref={toggleRef}
          type="button"
          onClick={onToggle}
          aria-expanded={false}
          aria-label={expandLabel}
          title={expandTitle ?? expandLabel}
          className={`h-11 w-full ${TOGGLE_CLASSES}`}
        >
          {expandChevron}
        </button>
        <div className="flex w-full justify-center">
          <RailTitle vertical>{title}</RailTitle>
        </div>
        {collapsedExtra}
      </aside>
    );
  }

  const collapseButton = (
    <button
      ref={toggleRef}
      type="button"
      onClick={onToggle}
      aria-expanded={true}
      aria-label={collapseLabel}
      title={collapseTitle ?? collapseLabel}
      className={`-my-2 h-11 w-11 ${TOGGLE_CLASSES}`}
    >
      {collapseChevron}
    </button>
  );

  const sizedWidth = resizer.width;

  return (
    <aside
      aria-label={title}
      {...(inert ? { inert: '' } : {})}
      className={`relative box-border flex shrink-0 grow-0 flex-col ${
        sizedWidth === null ? EXPANDED_WIDTH[width] : ''
      } ${edge} border-rt-tertiary bg-rt-surface-alt px-3`}
      style={
        sizedWidth === null
          ? undefined
          : { width: sizedWidth, minWidth: sizedWidth, maxWidth: sizedWidth, flexBasis: sizedWidth }
      }
    >
      <div className="-mx-3 flex shrink-0 items-center justify-between border-b border-rt-tertiary px-3 py-2">
        {onLeft ? (
          <>
            <RailTitle>{title}</RailTitle>
            {collapseButton}
          </>
        ) : (
          <>
            {collapseButton}
            <RailTitle>{title}</RailTitle>
          </>
        )}
      </div>
      <div
        className={`flex min-h-0 flex-1 flex-col transition-opacity duration-150 ${
          resizer.pendingClose ? 'opacity-40' : ''
        }`}
      >
        {children}
      </div>
      {resize && resizer.handleProps && !inert ? (
        // Straddles the inner border so it is easy to find: a few pixels over
        // the board as well as the rail. The line inside is what shows; the
        // strip around it is what takes the press.
        <div
          {...resizer.handleProps}
          aria-label={resize.label}
          title="Drag to resize. Double-click to reset."
          className={`group absolute inset-y-0 z-20 w-2 cursor-col-resize touch-none outline-none ${
            onLeft ? '-right-1' : '-left-1'
          }`}
        >
          <span
            aria-hidden
            className={`pointer-events-none absolute inset-y-0 left-1/2 w-0.5 -translate-x-1/2 transition-colors ${
              resizer.pendingClose
                ? 'bg-rt-ink-faint'
                : resizer.dragging
                  ? 'bg-rt-secondary'
                  : 'bg-transparent group-hover:bg-rt-secondary/70 group-focus-visible:bg-rt-secondary'
            }`}
          />
        </div>
      ) : null}
    </aside>
  );
}
