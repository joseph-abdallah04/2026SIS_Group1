import type { ReactNode } from 'react';

import { RoundTableLogo } from '../../components/RoundTableLogo';

/** The board's own connection, as the status line words it. */
export type BoardConnection = 'live' | 'reconnecting' | 'ended';

interface BoardHeaderProps {
  /** The question on the board, or null when there is none: the agenda is done. */
  question: string | null;
  /** Heads the page instead, when there is no question to. */
  sessionTitle: string;
  /** "Q2", or null with no question on the board. */
  questionNumber: string | null;
  /** "Discussing", "Brainstorming", "Answered"… or "Agenda complete". */
  phase: string;
  /** More about the question's state, after its phase: the shortlist, the countdown. */
  phaseDetails?: readonly ReactNode[];
  connection: BoardConnection;
  /** How long the session has been running. */
  clock?: ReactNode;
  /**
   * The session has no call. Said in the status line, as a fact about the
   * session, so that the missing mic reads as a choice rather than a fault.
   */
  noCall?: boolean;
  /** Right of the gap: who is here… */
  people?: ReactNode;
  /** …then, past a divider, the mic and Invite… */
  controls?: ReactNode;
  /** …and the way out: End for the leader, Leave for everyone else. */
  exit?: ReactNode;
}

/** A middle dot between two facts, and a pause for a screen reader. */
function Sep() {
  return (
    <>
      <span aria-hidden="true" className="text-rt-secondary-deep/40">
        ·
      </span>
      <span className="sr-only">, </span>
    </>
  );
}

function Connection({ state }: { state: BoardConnection }) {
  if (state === 'reconnecting') {
    // Only the exception used to be worth a pill. Here it simply takes the
    // place of "Live", in the board's amber, pulsing until it is live again.
    return (
      <span
        className="inline-flex items-center gap-1.5 font-medium text-rt-secondary-deep"
        title="Not receiving live updates; reconnecting"
      >
        <span aria-hidden="true" className="size-1.5 animate-pulse rounded-full bg-rt-secondary" />
        Reconnecting…
      </span>
    );
  }
  if (state === 'ended') {
    return (
      <span className="inline-flex items-center gap-1.5 font-medium text-rt-ink-muted">
        <span aria-hidden="true" className="size-1.5 rounded-full bg-rt-tertiary" />
        Session ended
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 font-semibold text-rt-ink">
      {/* The speaking ring's green: the one hue that means "live" here. */}
      <span
        aria-hidden="true"
        className="size-1.5 rounded-full bg-[#2f8f5b] shadow-[0_0_0_3px_rgba(47,143,91,0.14)]"
      />
      Live
    </span>
  );
}

/** Pieces of the status line with a dot between each. */
function Run({ children }: { children: readonly ReactNode[] }) {
  const pieces = children.filter(
    (piece) => piece !== null && piece !== undefined && piece !== false,
  );
  return pieces.map((piece, index) => (
    // Index keys: the pieces are positional, and never reorder within a render.
    <span key={index} className="inline-flex items-center gap-1.5">
      {index > 0 ? <Sep /> : null}
      {piece}
    </span>
  ));
}

/**
 * The board's header: what the room is on and whether it is live, at the left;
 * who is here and what you can do about it, at the right. Nothing in the middle.
 *
 * The question has the first line to itself. The line under it carries the
 * question's state (which one, its phase, any shortlist and countdown) and then
 * the session's (live, how long, no call), as words rather than pills: two
 * lines of text read as one heading, where a row of chips read as clutter.
 *
 * 52px, a little shorter than the pill row was, to leave the board the room.
 */
export function BoardHeader({
  question,
  sessionTitle,
  questionNumber,
  phase,
  phaseDetails = [],
  connection,
  clock,
  noCall = false,
  people,
  controls,
  exit,
}: BoardHeaderProps) {
  const heading =
    'truncate text-[14.5px] leading-[18px] font-semibold tracking-[-0.01em] text-rt-ink';

  return (
    <header className="flex h-13 shrink-0 items-center gap-3.5 border-b border-rt-secondary/40 bg-rt-secondary-wash px-5 text-rt-ink">
      <RoundTableLogo className="h-6.5 w-auto shrink-0" />
      {/* `min-w-0` so the question can give way: it truncates, and the agenda
          rail carries it in full. */}
      <div className="flex min-w-0 flex-col gap-0.5">
        {question ? (
          <p className={heading} title={question}>
            {question}
          </p>
        ) : (
          <h1 className={heading}>{sessionTitle}</h1>
        )}
        <p
          data-board-status
          className="flex min-w-0 items-center gap-1.5 overflow-hidden text-[11.5px] leading-[15px] whitespace-nowrap text-rt-ink-muted"
        >
          <Run>
            {[
              questionNumber,
              <span key="phase" className="font-semibold text-rt-secondary-deep">
                {phase}
              </span>,
              ...phaseDetails,
            ]}
          </Run>
          <span
            aria-hidden="true"
            className="mx-1 h-[11px] w-px shrink-0 bg-rt-secondary-deep/25"
          />
          <span className="sr-only">. </span>
          <Run>
            {[<Connection key="connection" state={connection} />, clock, noCall ? 'No call' : null]}
          </Run>
        </p>
      </div>
      <div aria-hidden="true" className="min-w-3 flex-1" />
      <div className="flex shrink-0 items-center gap-1.5">
        {people}
        {people && (controls || exit) ? (
          <span aria-hidden="true" className="mx-1.5 h-[22px] w-px bg-rt-secondary-deep/25" />
        ) : null}
        {controls}
        {exit ? <span className="ml-1 flex items-center">{exit}</span> : null}
      </div>
    </header>
  );
}
