import { createContext, useContext } from 'react';
import {
  CircleDashed,
  CircleMinus,
  Hourglass,
  Lightbulb,
  Scale,
  SkipForward,
  SquareCheckBig,
  Trophy,
  type LucideIcon,
} from 'lucide-react';
import {
  RECAP_OUTCOME_LABEL,
  type BoardItem,
  type RecapOutcomeKind,
  type SessionRecapParticipant,
} from '@roundtable/shared';

import { initialsFromName, swatchForId } from '../sessions/waitingRoomSeats';
import type { ExportFormat } from '../pinboard/proposalExport';

/** What a card on the summary can do, where the summary offers anything. */
export interface CardActions {
  onExport: (item: BoardItem, format: ExportFormat) => void;
  onCopyText: (item: BoardItem) => void;
}

/** What every card on the page needs to know, without passing it through every part. */
export interface RecapContextValue {
  viewerId: string | null;
  leaderId: string | null;
  actions?: CardActions;
  /** Opens a question's own board, read-only. None on a picture of a summary. */
  openBoard?: (questionId: string) => void;
}

export const RecapContext = createContext<RecapContextValue>({ viewerId: null, leaderId: null });

export function useRecapContext(): RecapContextValue {
  return useContext(RecapContext);
}

type Tone = 'decided' | 'tied' | 'discussed' | 'neutral';

/**
 * How each outcome looks wherever it appears: its icon, and the tone of its
 * chip, its number badge and its segment of the progress track. Amber is a
 * decision, blue-grey a tie (never dressed as a win), light amber a
 * brainstorm, grey everything that settled nothing.
 */
export const OUTCOME_LOOK: Record<RecapOutcomeKind, { icon: LucideIcon; tone: Tone }> = {
  decided: { icon: Trophy, tone: 'decided' },
  tied: { icon: Scale, tone: 'tied' },
  discussed: { icon: Lightbulb, tone: 'discussed' },
  'no-votes': { icon: CircleMinus, tone: 'neutral' },
  'vote-open': { icon: Hourglass, tone: 'neutral' },
  'not-voted': { icon: CircleMinus, tone: 'neutral' },
  skipped: { icon: SkipForward, tone: 'neutral' },
  'not-reached': { icon: CircleDashed, tone: 'neutral' },
};

const CHIP_TONE: Record<Tone, string> = {
  decided: 'border-rt-secondary/50 bg-rt-secondary-wash text-rt-secondary-deep',
  tied: 'border-rt-cool/55 bg-rt-cool-tint text-rt-cool-deep',
  discussed: 'border-rt-primary/80 bg-[#fff8ec] text-rt-secondary-deep',
  neutral: 'border-[#e3e3e5] bg-rt-surface-alt text-rt-ink-muted',
};

const NUMBER_TONE: Record<Tone, string> = {
  decided: 'border-rt-secondary bg-rt-secondary text-rt-ink',
  tied: 'border-rt-cool bg-rt-cool-tint text-rt-cool-deep',
  discussed: 'border-rt-primary bg-rt-secondary-wash text-rt-secondary-deep',
  neutral: 'border-rt-tertiary bg-rt-surface text-rt-ink-muted',
};

export function OutcomeChip({ kind }: { kind: RecapOutcomeKind }) {
  const { icon: Icon, tone } = OUTCOME_LOOK[kind];
  return (
    <span
      className={`inline-flex h-6 shrink-0 items-center gap-1.5 rounded-full border px-2.5 text-[11.5px] font-semibold whitespace-nowrap ${CHIP_TONE[tone]}`}
    >
      <Icon aria-hidden size={12} strokeWidth={2.2} />
      {RECAP_OUTCOME_LABEL[kind]}
    </span>
  );
}

/** Vote or Brainstorm, with the setup page's icons. */
export function KindChip({ votingEnabled }: { votingEnabled: boolean }) {
  const Icon = votingEnabled ? SquareCheckBig : Lightbulb;
  return (
    <span className="inline-flex h-6 shrink-0 items-center gap-1.5 rounded-full border border-rt-tertiary bg-rt-surface px-2.5 text-[11.5px] font-medium whitespace-nowrap text-rt-ink-muted">
      <Icon aria-hidden size={12} strokeWidth={2.2} />
      {votingEnabled ? 'Vote' : 'Brainstorm'}
    </span>
  );
}

export function QuestionNumber({ n, kind }: { n: number; kind: RecapOutcomeKind }) {
  return (
    <span
      aria-hidden
      className={`flex size-6 shrink-0 items-center justify-center rounded-full border text-[11.5px] font-semibold tabular-nums ${
        NUMBER_TONE[OUTCOME_LOOK[kind].tone]
      } ${kind === 'skipped' ? 'border-dashed' : ''}`}
    >
      {n}
    </span>
  );
}

/** The progress track's segment colour for each outcome. */
export const SEGMENT_CLASS: Record<RecapOutcomeKind, string> = {
  decided: 'bg-rt-secondary',
  tied: 'bg-rt-cool',
  discussed: 'bg-rt-primary',
  'no-votes': 'bg-[#d9d4cb]',
  'vote-open': 'bg-[#d9d4cb]',
  'not-voted': 'bg-[#d9d4cb]',
  skipped: 'rt-recap-hatched',
  'not-reached': 'bg-rt-tertiary/40',
};

/** A person's face: their initials on their seat colour, as everywhere else. */
export function Avatar({
  person,
  size = 'md',
}: {
  person: Pick<SessionRecapParticipant, 'userId' | 'displayName'>;
  size?: 'sm' | 'md';
}) {
  const swatch = swatchForId(person.userId ?? person.displayName);
  return (
    <span
      aria-hidden
      className={`flex shrink-0 items-center justify-center rounded-full font-semibold ring-2 ring-rt-surface ${
        size === 'sm' ? 'size-5.5 text-[9px]' : 'size-7 text-[10.5px]'
      }`}
      style={{ background: swatch.background, color: swatch.color }}
    >
      {initialsFromName(person.displayName)}
    </span>
  );
}
