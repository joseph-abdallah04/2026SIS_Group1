import { useCallback, useMemo } from 'react';
import type { BoardItem, SessionRecap } from '@roundtable/shared';

import { copyText } from '../../lib/copyText';
import { useProposalExport } from '../pinboard/proposalExport';
import { stickyPlainText } from '../tools/sticky/stickyMarks';
import { QuestionRecapCard } from './QuestionRecapCard';
import { RecapDigest } from './RecapDigest';
import { RecapHero } from './RecapHero';
import { RecapStatus, useRecapStatus, type RecapStatusNote } from './RecapStatus';
import { RecapContext, type CardActions, type RecapContextValue } from './recapUi';

/**
 * F31 recap, read top to bottom (L1): who and when, then "At a glance" — every
 * question and what became of it — then each question in full, its decision
 * first. S04's download lives in the ended page's bar.
 *
 * With `cardActions`, each card opens the board's own actions menu, less
 * anything that would change it: Enlarge, Copy text, and Export; and a card's
 * picture in a list of results opens it in the board's enlarged view. Off by
 * default, so a picture of a summary — the landing page's — stays a picture.
 * How an export or a copy went is said through `onStatus`, the page's one
 * status region; without it, the view keeps a region of its own.
 *
 * Every part lays itself out from the width it is given (container queries,
 * cards that scale down to fit), so the page reads the same at any window
 * size and never scrolls sideways.
 */
export function SessionSummaryView({
  summary,
  viewerId,
  cardActions = false,
  onStatus,
  voiceEnabled,
  onOpenBoard,
  justEnded = false,
}: {
  summary: SessionRecap;
  viewerId: string | null;
  cardActions?: boolean;
  onStatus?: (note: RecapStatusNote) => void;
  /** Whether the session had a call, when the page knows (the recap does not say). */
  voiceEnabled?: boolean;
  /** Opens a question's own board; each question offers it when given. */
  onOpenBoard?: (questionId: string) => void;
  /** The meeting has just ended in front of this viewer: "That's a wrap". */
  justEnded?: boolean;
}) {
  const own = useRecapStatus();
  const report = onStatus ?? own.report;
  const onExport = useProposalExport(report);
  const onCopyText = useCallback(
    (item: BoardItem) => {
      if (item.artifactJson.type !== 'sticky') return;
      void copyText(stickyPlainText(item.artifactJson)).then((copied) =>
        report({
          ok: copied,
          text: copied ? 'Copied to clipboard' : 'Could not copy that text',
        }),
      );
    },
    [report],
  );
  const context = useMemo<RecapContextValue>(() => {
    const actions: CardActions | undefined = cardActions ? { onExport, onCopyText } : undefined;
    return { viewerId, leaderId: summary.leaderId, actions, openBoard: onOpenBoard };
  }, [cardActions, onExport, onCopyText, viewerId, summary.leaderId, onOpenBoard]);

  return (
    <RecapContext.Provider value={context}>
      <div className="flex min-w-0 flex-col gap-10">
        <RecapHero
          summary={summary}
          viewerId={viewerId}
          voiceEnabled={voiceEnabled}
          justEnded={justEnded}
        />
        <RecapDigest summary={summary} viewerId={viewerId} />
        {summary.questions.length > 0 ? (
          <section aria-labelledby="recap-questions" className="flex flex-col gap-4">
            <h2 id="recap-questions" className="text-[19px] font-semibold tracking-[-0.01em]">
              Questions
            </h2>
            {summary.questions.map((question, index) => (
              <QuestionRecapCard key={question.id} question={question} index={index} />
            ))}
          </section>
        ) : (
          <p className="text-[13px] text-rt-ink-muted">This session had no questions.</p>
        )}
      </div>
      {cardActions && !onStatus ? <RecapStatus status={own.status} /> : null}
    </RecapContext.Provider>
  );
}
