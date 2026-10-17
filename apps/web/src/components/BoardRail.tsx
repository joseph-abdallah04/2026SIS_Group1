import type { ReactNode, Ref } from 'react';
import { PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen } from 'lucide-react';

import { useRailResize } from './useRailResize';

export type BoardRailSide = 'left' | 'right';

/** The open column of a rail that does not resize. */
const EXPANDED_WIDTH = 'w-64 min-w-64 max-w-64 basis-64';
/** The collapsed strip, and the activity bar that stands in for it. */
const STRIP_WIDTH = 'w-11 min-w-11 max-w-11 shrink-0 grow-0 basis-11';

const TITLE_CLASSES = 'text-[10px] font-semibold tracking-[0.16em] text-rt-ink-faint uppercase';
/** The same quiet round button as the agenda's +, so the header's controls match. */
const TOGGLE_CLASSES =
  'inline-flex size-7 shrink-0 items-center justify-center rounded-full text-rt-ink-muted transition-colors hover:bg-rt-ink/[0.06] hover:text-rt-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rt-secondary';

interface BoardRailProps {
  /** Which edge of the board this dock sits on — flips the border and chevrons. */
  side: BoardRailSide;
  /** Names the rail for assistive tech, and heads it when open unless `panelTitle` does. */
  title: string;
  /**
   * What the open panel's header says, when it is not `title`: the side panel
   * names whichever of its features is on show, while the rail as a whole
   * keeps one name.
   */
  panelTitle?: ReactNode;
  /**
   * An activity bar on the rail's outer edge, there whether the rail is open
   * or not. It takes the place of the collapsed strip's toggle and title, and
   * the open panel sits on its board side. The side panel's People, Chat and
   * AI buttons are one.
   *
   * The rail stays one mounted piece either way, which is what lets a drag
   * that closes it reopen it in the same gesture (`useRailResize` lets go of
   * a drag when its rail unmounts).
   */
  strip?: ReactNode;
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
   * that share one open at the same size. `defaultWidth` is where it opens
   * before anyone has dragged it.
   */
  resize?: { storageKey: string; label: string; defaultWidth?: number };
  /**
   * Under the title, in the same header zone and above its one divider: the
   * agenda's progress, which belongs to the heading rather than to the list.
   */
  subheader?: ReactNode;
  /** A control beside the collapse arrow, such as the agenda's +. */
  headerAction?: ReactNode;
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
 * Shared chrome for the session's left and right docks (agenda, side panel).
 *
 * The two rails are mirrors of one piece: same padding, title and toggle.
 * `side` flips the border and the chevrons. `resize` trades the fixed column
 * for one the user drags to size, and `strip` trades the collapsed strip for
 * an activity bar that stays put while the panel opens beside it.
 */
export function BoardRail({
  side,
  title,
  panelTitle,
  strip,
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
  subheader,
  headerAction,
  children,
}: BoardRailProps) {
  const resizer = useRailResize({
    side,
    storageKey: resize?.storageKey,
    collapsed,
    onToggle,
    defaultWidth: resize?.defaultWidth,
  });
  const onLeft = side === 'left';
  const edge = onLeft ? 'border-r' : 'border-l';
  // A panel with its edge on the rail's side: closing it points back to that
  // edge, opening it points away.
  const ExpandIcon = onLeft ? PanelLeftOpen : PanelRightOpen;
  const CollapseIcon = onLeft ? PanelLeftClose : PanelRightClose;
  const inertProps = inert ? { inert: '' } : {};

  // The bar sits in the collapsed strip's place, with its padding and edge, so
  // the board ends at the same line whether the panel beside it is open or not.
  const activityBar = strip ? (
    <div
      className={`box-border flex ${STRIP_WIDTH} flex-col items-center ${edge} border-rt-tertiary bg-rt-surface-alt pt-1.5 pb-3`}
    >
      {strip}
    </div>
  ) : null;

  if (collapsed && activityBar) {
    return (
      <aside aria-label={title} {...inertProps} className="flex shrink-0 grow-0">
        {activityBar}
      </aside>
    );
  }

  if (collapsed) {
    return (
      <aside
        aria-label={title}
        {...inertProps}
        className={`box-border flex ${STRIP_WIDTH} flex-col items-center gap-3 ${edge} border-rt-tertiary bg-rt-surface-alt py-3`}
      >
        <button
          ref={toggleRef}
          type="button"
          onClick={onToggle}
          aria-expanded={false}
          aria-label={expandLabel}
          title={expandTitle ?? expandLabel}
          className={TOGGLE_CLASSES}
        >
          <ExpandIcon aria-hidden="true" data-rail-icon="expand" size={16} strokeWidth={2} />
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
      // Pulled towards the panel's edge by the icon's own inset (its frame is
      // drawn 7px inside the 28px button), so the drawn icon ends where the
      // header's content does, flush with the progress bar under it.
      className={`-my-1 ${onLeft ? '-mr-[7px]' : '-ml-[7px]'} ${TOGGLE_CLASSES}`}
    >
      <CollapseIcon aria-hidden="true" data-rail-icon="collapse" size={16} strokeWidth={2} />
    </button>
  );

  const sizedWidth = resizer.width;
  const heading = panelTitle ?? title;
  const panelClass = `relative box-border flex shrink-0 grow-0 flex-col ${
    sizedWidth === null ? EXPANDED_WIDTH : ''
  } ${edge} border-rt-tertiary bg-rt-surface-alt px-3`;
  const panelStyle =
    sizedWidth === null
      ? undefined
      : { width: sizedWidth, minWidth: sizedWidth, maxWidth: sizedWidth, flexBasis: sizedWidth };

  const panelContents = (
    <>
      <div className="-mx-3 shrink-0 border-b border-rt-tertiary px-3 py-2">
        <div className="flex items-center justify-between">
          {onLeft ? (
            <>
              <RailTitle>{heading}</RailTitle>
              <span className="flex items-center">
                {headerAction}
                {collapseButton}
              </span>
            </>
          ) : (
            <>
              <span className="flex items-center">
                {collapseButton}
                {headerAction}
              </span>
              <RailTitle>{heading}</RailTitle>
            </>
          )}
        </div>
        {subheader ? <div className="pt-1 pb-1.5">{subheader}</div> : null}
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
    </>
  );

  if (activityBar) {
    // One landmark for the bar and the panel: they are one rail, and the bar
    // stays on the outer edge so it never moves when the panel opens.
    return (
      <aside aria-label={title} {...inertProps} className="flex shrink-0 grow-0">
        {onLeft ? activityBar : null}
        <div className={panelClass} style={panelStyle}>
          {panelContents}
        </div>
        {onLeft ? null : activityBar}
      </aside>
    );
  }

  return (
    <aside aria-label={title} {...inertProps} className={panelClass} style={panelStyle}>
      {panelContents}
    </aside>
  );
}
