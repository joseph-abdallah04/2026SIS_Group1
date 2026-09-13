import type { ReactNode } from 'react';

export type BoardRailSide = 'left' | 'right';

const TITLE_CLASSES =
  'text-[10px] font-semibold tracking-[0.16em] text-rt-ink-faint uppercase';
const TOGGLE_CLASSES =
  'inline-flex items-center justify-center text-[13px] font-semibold text-rt-primary-deep hover:opacity-70';

interface BoardRailProps {
  /** Which edge of the board this dock sits on — flips the border and chevrons. */
  side: BoardRailSide;
  title: string;
  collapsed: boolean;
  onToggle: () => void;
  expandLabel: string;
  collapseLabel: string;
  expandTitle?: string;
  collapseTitle?: string;
  /** Strip-only extras (presence bubbles). Omitted on a rail that has none. */
  collapsedExtra?: ReactNode;
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
 * Shared chrome for the session's left and right docks (agenda, in the room).
 *
 * The two rails are mirrors of one piece: same width, padding, title and
 * toggle. `side` is the only thing that changes — border on the board edge,
 * chevron pointing at the board when open and away from it when closed, title
 * on the outside of the header.
 */
export function BoardRail({
  side,
  title,
  collapsed,
  onToggle,
  expandLabel,
  collapseLabel,
  expandTitle,
  collapseTitle,
  collapsedExtra,
  children,
}: BoardRailProps) {
  const onLeft = side === 'left';
  const edge = onLeft ? 'border-r' : 'border-l';
  const expandChevron = onLeft ? '›' : '‹';
  const collapseChevron = onLeft ? '‹' : '›';

  if (collapsed) {
    return (
      <aside
        className={`box-border flex w-11 min-w-11 max-w-11 shrink-0 grow-0 basis-11 flex-col items-center gap-3 ${edge} border-rt-tertiary bg-rt-surface-alt py-3`}
      >
        <button
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

  return (
    <aside
      className={`box-border flex w-64 min-w-64 max-w-64 shrink-0 grow-0 basis-64 flex-col ${edge} border-rt-tertiary bg-rt-surface-alt px-3`}
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
      <div className="flex min-h-0 flex-1 flex-col">{children}</div>
    </aside>
  );
}
