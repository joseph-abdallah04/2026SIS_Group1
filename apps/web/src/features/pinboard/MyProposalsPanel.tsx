import type { AuthoredProposalGroup, BoardItem } from '@roundtable/shared';
import { RotateCcw } from 'lucide-react';

/** A one-line stand-in for the artifact, small enough for a narrow panel. */
function summarise(item: BoardItem): string {
  const artifact = item.artifactJson;
  if (artifact.type === 'sticky') return artifact.text;
  if (artifact.type === 'diagram') {
    const labelled = artifact.nodes.find((node) => node.label.trim().length > 0);
    const count = artifact.nodes.length;
    return labelled ? labelled.label : `Diagram, ${count} ${count === 1 ? 'shape' : 'shapes'}`;
  }
  return 'Drawing';
}

const KIND_LABEL: Record<BoardItem['type'], string> = {
  sticky: 'Sticky',
  drawing: 'Drawing',
  diagram: 'Diagram',
};

interface MyProposalsPanelProps {
  groups: readonly AuthoredProposalGroup[];
  /** Null between questions, when there is nothing to reuse onto. */
  currentQuestionId: string | null;
  /** False while the board is not taking proposals, which closes reuse too. */
  canPropose: boolean;
  /** Opens the proposal in its own editor, prefilled, to land as a new one. */
  onReuse: (item: BoardItem) => void;
  error: string | null;
}

/**
 * Your own proposals from this session, and a way to put an earlier one on the
 * question now in front of you (F38).
 *
 * A session runs through several questions, and something proposed against an
 * earlier one often answers the current one too. Without this the only way to
 * say it again is to make it again.
 *
 * Reuse copies rather than moves. The original stays on the question it was
 * proposed to, because that board is the record of what was said at the time
 * and the voting and summary that follow depend on it.
 *
 * Proposals already on the current question are still listed, because leaving
 * them out would make the list look like it had lost things, but they offer no
 * reuse: they are on the board already.
 */
export function MyProposalsPanel({
  groups,
  currentQuestionId,
  canPropose,
  onReuse,
  error,
}: MyProposalsPanelProps) {
  const total = groups.reduce((sum, group) => sum + group.items.length, 0);

  return (
    <div className="flex max-h-[360px] w-72 flex-col overflow-hidden rounded-xl border border-rt-tertiary bg-rt-surface shadow-lg">
      <p className="shrink-0 border-b border-rt-tertiary px-3 py-2 text-[10px] font-semibold tracking-[0.16em] text-rt-ink-faint uppercase">
        My proposals
      </p>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {error ? (
          <p role="alert" className="px-3 py-3 text-[12px] text-rt-secondary-deep">
            {error}
          </p>
        ) : null}

        {total === 0 && !error ? (
          <p className="px-3 py-4 text-[12px] leading-relaxed text-rt-ink-muted">
            Nothing yet. Anything you propose in this session is listed here, ready to reuse on a
            later question.
          </p>
        ) : null}

        {groups.map((group) => (
          <section key={group.questionId}>
            <h3 className="sticky top-0 border-b border-rt-tertiary bg-rt-surface-alt px-3 py-1.5 text-[11px] leading-snug font-medium text-rt-ink-muted">
              {group.isCurrent ? (
                <span className="mr-1 text-[9.5px] tracking-[0.08em] text-rt-ink-faint uppercase">
                  Now
                </span>
              ) : null}
              {group.questionText}
            </h3>

            <ul>
              {group.items.map((item) => {
                // Already on the board, so there is nothing to bring across.
                const reusable = !group.isCurrent && canPropose && currentQuestionId !== null;
                return (
                  <li
                    key={item.id}
                    className="flex items-start gap-2 border-b border-rt-tertiary/60 px-3 py-2"
                  >
                    <div className="min-w-0 flex-1">
                      <span className="text-[9.5px] font-semibold tracking-[0.08em] text-rt-ink-faint uppercase">
                        {KIND_LABEL[item.type]}
                      </span>
                      <p className="line-clamp-2 wrap-break-word text-[12px] leading-snug text-rt-ink">
                        {summarise(item)}
                      </p>
                    </div>

                    {reusable ? (
                      <button
                        type="button"
                        onClick={() => onReuse(item)}
                        title="Reuse on the current question"
                        aria-label={`Reuse ${KIND_LABEL[item.type].toLowerCase()} on the current question`}
                        className="mt-0.5 inline-flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full border border-rt-tertiary bg-white text-rt-ink-muted shadow-sm transition-colors hover:bg-rt-primary-tint hover:text-rt-ink focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-rt-primary"
                      >
                        <RotateCcw aria-hidden="true" size={12} strokeWidth={2} />
                      </button>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
