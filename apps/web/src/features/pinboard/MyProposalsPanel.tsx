import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { AuthoredProposalGroup, BoardItem, QuestionStatus } from '@roundtable/shared';
import { RotateCcw, X } from 'lucide-react';

import { closingFades } from '../../lib/motion';
import { StickyText } from '../tools/sticky/StickyText';
import type { StickyContent } from '../tools/sticky/stickyMarks';
import { hasArtwork, ProposalArtwork } from './ProposalCard';
import { STICKY_SHADOW, STICKY_THEMES, THUMB_BACKGROUND } from './pinboardTokens';

const KIND_LABEL: Record<BoardItem['type'], string> = {
  sticky: 'Sticky',
  drawing: 'Drawing',
  diagram: 'Diagram',
  image: 'Image',
};

const STATUS_LABEL: Record<QuestionStatus, string> = {
  pending: 'Not started',
  discussion: 'Discussing',
  voting: 'Voting',
  answered: 'Answered',
  skipped: 'Skipped',
};

/**
 * The kinds of idea the list can be narrowed to, named as the toolbar names
 * the tools that make them. A drawing and a diagram are both made in the
 * Studio, so they are one filter.
 */
type Kind = 'sticky' | 'studio' | 'image';

const KIND_FILTERS: ReadonlyArray<{ kind: Kind; label: string }> = [
  { kind: 'sticky', label: 'Stickies' },
  { kind: 'studio', label: 'Studio' },
  { kind: 'image', label: 'Images' },
];

function kindOf(item: BoardItem): Kind {
  if (item.type === 'sticky') return 'sticky';
  if (item.type === 'image') return 'image';
  return 'studio';
}

/** How long ago, as a person would say it: "just now", "4 min ago", "2 h ago". */
export function timeAgo(iso: string, now = Date.now()): string {
  const minutes = Math.floor((now - new Date(iso).getTime()) / 60_000);
  if (!Number.isFinite(minutes) || minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.floor(hours / 24);
  return `${days} ${days === 1 ? 'day' : 'days'} ago`;
}

interface MyProposalsPanelProps {
  groups: readonly AuthoredProposalGroup[];
  /** Null between questions, when there is nothing to reuse onto. */
  currentQuestionId: string | null;
  /** False while the board is not taking proposals, which closes reuse too. */
  canPropose: boolean;
  /** Opens the proposal in its own editor, prefilled, to land as a new one. */
  onReuse: (item: BoardItem) => void;
  error: string | null;
  /** Puts the panel away, from the close button in its corner. */
  onClose?: () => void;
  /** On its way out: fades rather than vanishing. */
  leaving?: boolean;
}

/**
 * Your own proposals from this session, and a way to put an earlier one on the
 * question now in front of you (F38).
 *
 * A session runs through several questions, and something proposed against an
 * earlier one often answers the current one too. Without this the only way to
 * say it again is to make it again.
 *
 * Each proposal is shown as it looks on the board, a sticky in its own colour
 * and artwork as a preview, under the question it was proposed to, newest
 * first. Somebody with a long session behind them can narrow it to one
 * question, to one kind of idea, or both. Kinds rather than a text search,
 * because a picture or a drawing has no words to search for.
 *
 * Reuse copies rather than moves. The original stays on the question it was
 * proposed to, because that board is the record of what was said at the time
 * and the voting and summary that follow depend on it.
 *
 * Proposals already on the current question are left out: they are on the
 * board in front of you, so there is nothing to bring across.
 */
export function MyProposalsPanel({
  groups,
  currentQuestionId,
  canPropose,
  onReuse,
  error,
  onClose,
  leaving = false,
}: MyProposalsPanelProps) {
  const [questionFilter, setQuestionFilter] = useState<string | null>(null);
  const [kindFilter, setKindFilter] = useState<Kind | null>(null);

  const canReuseHere = canPropose && currentQuestionId !== null;
  const past = useMemo(
    () =>
      groups
        .filter((group) => !group.isCurrent && group.items.length > 0)
        .sort((a, b) => b.questionPosition - a.questionPosition),
    [groups],
  );
  const reusableCount = past.reduce((sum, group) => sum + group.items.length, 0);

  // Only the kinds there actually are: a filter that can only ever show
  // nothing is not a choice worth offering.
  const kinds = KIND_FILTERS.filter(({ kind }) =>
    past.some((group) => group.items.some((item) => kindOf(item) === kind)),
  );
  const matches = (item: BoardItem) => kindFilter === null || kindOf(item) === kindFilter;
  const shownGroups = past
    .filter((group) => questionFilter === null || group.questionId === questionFilter)
    .map((group) => ({
      ...group,
      items: [...group.items]
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .filter(matches),
    }))
    .filter((group) => group.items.length > 0);
  const nothingMatches = reusableCount > 0 && shownGroups.length === 0;

  // The panel's height, measured off what is inside it and eased to: a filter
  // that shows fewer cards shrinks the panel smoothly rather than snapping it.
  // Left to the content on the first paint, so opening does not grow from zero.
  const content = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState<number | null>(null);
  useLayoutEffect(() => {
    const element = content.current;
    if (!element) return;
    const measure = () => setHeight(element.offsetHeight);
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return (
    // Rises from the toolbar as the sticky popup does, and fades back into it.
    <div
      className={`${leaving ? 'rt-sticky-popup-fade' : 'rt-sticky-popup-rise'} w-[44rem] max-w-[calc(100cqw-3rem)] overflow-hidden rounded-3xl border border-rt-tertiary bg-white shadow-[0_18px_48px_rgba(8,12,21,0.18)] transition-[height] duration-200 ease-out motion-reduce:transition-none`}
      style={height === null ? undefined : { height }}
    >
      <div ref={content} className="flex max-h-[min(34rem,calc(100cqh-8rem))] flex-col">
        <header className="shrink-0 px-5 pt-4 pb-3">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <h2 className="text-[15px] font-semibold text-rt-ink">Reuse</h2>
            <p className="text-[12.5px] text-rt-ink-muted">
              Ideas you proposed earlier in this session
            </p>
            {onClose ? (
              // The same close as the sticky popup's, in the same corner.
              <button
                type="button"
                aria-label="Close"
                onClick={onClose}
                className="ml-auto flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-rt-ink/20 text-rt-ink/70 transition-colors hover:bg-rt-ink/8 hover:text-rt-ink focus-visible:ring-2 focus-visible:ring-rt-ink focus-visible:outline-none"
              >
                <X aria-hidden="true" size={15} strokeWidth={2.4} />
              </button>
            ) : null}
          </div>

          {past.length > 1 || kinds.length > 1 ? (
            <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
              {past.length > 1 ? (
                <div role="group" aria-label="Show ideas from" className="flex flex-wrap gap-1.5">
                  <FilterChip
                    active={questionFilter === null}
                    onClick={() => setQuestionFilter(null)}
                  >
                    All
                  </FilterChip>
                  {[...past]
                    .sort((a, b) => a.questionPosition - b.questionPosition)
                    .map((group) => (
                      <FilterChip
                        key={group.questionId}
                        active={questionFilter === group.questionId}
                        onClick={() => setQuestionFilter(group.questionId)}
                      >
                        Q{group.questionPosition + 1}
                      </FilterChip>
                    ))}
                </div>
              ) : null}
              {past.length > 1 && kinds.length > 1 ? (
                <span aria-hidden="true" className="h-5 w-px bg-rt-tertiary" />
              ) : null}
              {kinds.length > 1 ? (
                // Picking one narrows to it; picking it again shows every kind.
                <div
                  role="group"
                  aria-label="Show kinds of idea"
                  className="flex flex-wrap gap-1.5"
                >
                  {kinds.map(({ kind, label }) => (
                    <FilterChip
                      key={kind}
                      active={kindFilter === kind}
                      onClick={() => setKindFilter((current) => (current === kind ? null : kind))}
                    >
                      {label}
                    </FilterChip>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-4">
          {error ? (
            <p role="alert" className="mb-3 text-[12px] text-rt-secondary-deep">
              {error}
            </p>
          ) : null}

          {reusableCount === 0 && !error ? (
            <p className="py-2 text-[12.5px] leading-relaxed text-rt-ink-muted">
              Nothing yet. Anything you propose in this session shows up here, ready to reuse on a
              later question.
            </p>
          ) : null}

          {nothingMatches ? (
            <p className="py-2 text-[12.5px] text-rt-ink-muted">
              Nothing here matches those filters.
            </p>
          ) : null}

          {shownGroups.map((group) => (
            <QuestionSection
              key={group.questionId}
              group={group}
              label={
                // A brainstorm-only question has no answer, only a discussion.
                group.questionStatus === 'answered' && !group.votingEnabled
                  ? 'Discussed'
                  : STATUS_LABEL[group.questionStatus]
              }
              reusable={canReuseHere}
              onReuse={onReuse}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className="h-7 rounded-full border border-rt-tertiary px-3 text-[11.5px] font-semibold text-rt-ink-muted transition-colors hover:bg-rt-surface-alt hover:text-rt-ink focus-visible:ring-2 focus-visible:ring-rt-secondary focus-visible:outline-none aria-pressed:border-rt-ink aria-pressed:bg-rt-ink aria-pressed:text-white"
    >
      {children}
    </button>
  );
}

/** One question's proposals: its number and text, then the cards. */
function QuestionSection({
  group,
  label,
  reusable,
  onReuse,
}: {
  group: AuthoredProposalGroup;
  label: string;
  reusable: boolean;
  onReuse?: (item: BoardItem) => void;
}) {
  // Long notes opened up to be read in full, each across its own row.
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set());
  const toggle = (id: string) =>
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <section className="mt-1 mb-4 last:mb-0">
      <h3 className="mb-2 flex items-baseline gap-2 text-[12px] leading-snug">
        <span className="shrink-0 text-[10.5px] font-semibold tracking-[0.1em] text-rt-ink-faint uppercase">
          Q{group.questionPosition + 1} · {label}
        </span>
        <span className="min-w-0 truncate text-rt-ink-muted">{group.questionText}</span>
      </h3>
      <ul className="grid grid-cols-[repeat(auto-fill,minmax(9.5rem,1fr))] gap-3">
        {group.items.map((item) => (
          <li key={item.id} className={expanded.has(item.id) ? 'col-span-full' : undefined}>
            <ReuseCard
              item={item}
              onReuse={reusable ? onReuse : undefined}
              expanded={expanded.has(item.id)}
              onToggleExpanded={() => toggle(item.id)}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * A sticky's note in a card, with its formatting: bold, lists and line breaks
 * are often what makes a long note recognisable from its first few lines.
 * The first line is a touch heavier, as a title would be.
 *
 * Four lines at most. A note longer than that fades out at the foot, into the
 * sticky's own colour, rather than ending in an ellipsis: the fade says there
 * is more without a mark in the text. Measured, so a note that fits is never
 * faded. Opened up, it shows the whole note.
 */
function StickyPreview({
  note,
  expanded,
  onOverflow,
}: {
  note: StickyContent;
  expanded: boolean;
  /** Whether the note runs past four lines, for the card to offer to open it. */
  onOverflow: (overflows: boolean) => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [overflows, setOverflows] = useState(false);

  // Measured only while it is held to four lines: opened up, nothing is cut
  // off, and the answer from before is still the right one.
  useLayoutEffect(() => {
    const element = box.current;
    if (!element || expanded) return;
    const next = element.scrollHeight > element.clientHeight + 1;
    setOverflows(next);
    onOverflow(next);
  }, [expanded, note, onOverflow]);

  const faded = overflows && !expanded;
  const fade = 'linear-gradient(to bottom, black 50%, transparent)';
  return (
    <div
      ref={box}
      data-overflows={faded ? 'true' : undefined}
      className={`mt-1.5 text-[13px] leading-snug wrap-break-word text-rt-ink [&>div:first-child]:font-semibold ${
        expanded ? '' : 'max-h-[4.5rem] overflow-hidden'
      }`}
      style={faded ? { maskImage: fade, WebkitMaskImage: fade } : undefined}
    >
      {/* Inert: the whole card is already the press. */}
      <StickyText note={note} links="inert" />
    </div>
  );
}

/**
 * One proposal, as it looks on the board. The whole card is the reuse button,
 * with the action spelled out over it on hover and focus; a card that cannot
 * be reused is shown faded and does nothing.
 *
 * A sticky too long for its card offers "Show all", which opens it across the
 * row to be read in full. It is a button of its own beside the card's, never
 * inside it, so reading a note can never reuse it by accident.
 */
function ReuseCard({
  item,
  onReuse,
  expanded = false,
  onToggleExpanded,
}: {
  item: BoardItem;
  onReuse?: (item: BoardItem) => void;
  expanded?: boolean;
  onToggleExpanded?: () => void;
}) {
  const [overflows, setOverflows] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const artifact = item.artifactJson;
  const sticky = artifact.type === 'sticky' ? STICKY_THEMES[artifact.color] : null;

  // Opened to be read, it is brought into view from its top, so the whole note
  // is there to read without scrolling for it. Closed again, the popup moves
  // only as far as it must to keep the card in sight. Skipped on the first
  // render, which is not anybody opening or closing anything.
  const settled = useRef(false);
  useEffect(() => {
    if (!settled.current) {
      settled.current = true;
      return;
    }
    root.current?.scrollIntoView?.({
      block: expanded ? 'start' : 'nearest',
      behavior: closingFades() ? 'smooth' : 'auto',
    });
  }, [expanded]);
  const opens = sticky !== null && onToggleExpanded !== undefined && (overflows || expanded);
  const face = (
    <>
      <span className="text-[10px] font-semibold tracking-[0.1em] text-rt-ink-faint uppercase">
        {KIND_LABEL[item.type]}
      </span>
      {sticky ? (
        artifact.type === 'sticky' ? (
          <StickyPreview note={artifact} expanded={expanded} onOverflow={setOverflows} />
        ) : null
      ) : (
        <div
          className="relative mt-1.5 h-[4.75rem] overflow-hidden rounded-lg"
          style={{ background: THUMB_BACKGROUND }}
        >
          {hasArtwork(item) ? <ProposalArtwork item={item} /> : null}
        </div>
      )}
      <span className="mt-auto pt-2 text-[11px] text-rt-ink-faint">{timeAgo(item.createdAt)}</span>
    </>
  );
  const surface = sticky
    ? { background: sticky.bg, boxShadow: STICKY_SHADOW }
    : { background: '#FFFFFF' };
  const shape = `relative flex w-full flex-col p-3 text-left ${
    expanded ? 'min-h-[9.5rem]' : 'h-[9.5rem]'
  } ${sticky ? '' : 'rounded-xl border border-rt-tertiary'}`;

  const card = !onReuse ? (
    <div className={`${shape} opacity-55`} style={surface}>
      {face}
    </div>
  ) : (
    <button
      type="button"
      onClick={() => onReuse(item)}
      aria-label={`Reuse ${KIND_LABEL[item.type].toLowerCase()} on the current question`}
      className={`group ${shape} focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rt-secondary`}
      style={surface}
    >
      {face}
      {/* The action spelled out over the card on hover and focus. The card
          itself stays put: it does not lift. Opened up, it moves to the corner
          and leaves the note readable rather than covering it. */}
      <span
        aria-hidden="true"
        className={`pointer-events-none absolute inset-0 flex opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100 ${
          expanded ? 'items-start justify-end p-2.5' : 'items-center justify-center bg-white/55'
        }`}
      >
        <span className="inline-flex items-center gap-1.5 rounded-full bg-rt-secondary px-3.5 py-1.5 text-[12px] font-semibold text-rt-ink shadow-sm">
          <RotateCcw size={12} strokeWidth={2.2} />
          Reuse
        </span>
      </span>
    </button>
  );

  return (
    // Scrolled to from its top with a little room above, clear of the edge.
    <div ref={root} className="relative scroll-mt-3">
      {card}
      {opens ? (
        <button
          type="button"
          aria-expanded={expanded}
          onClick={onToggleExpanded}
          className="absolute right-2 bottom-2 z-10 rounded-full px-2 py-1 text-[11px] font-semibold text-rt-ink-muted transition-colors hover:bg-rt-ink/8 hover:text-rt-ink focus-visible:outline-2 focus-visible:outline-rt-secondary"
        >
          {expanded ? 'Show less' : 'Show all'}
        </button>
      ) : null}
    </div>
  );
}
