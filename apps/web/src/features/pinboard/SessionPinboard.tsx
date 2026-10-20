import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { ScreenShare } from 'lucide-react';
import { SHORTLIST_MIN, type BoardResponse, type Question } from '@roundtable/shared';

import { RoundTableLogo } from '../../components/RoundTableLogo';
import { PhaseTimer } from '../../components/PhaseTimer';
import { AgendaPanel } from '../agenda/AgendaPanel';
import { MyProposalsLauncher } from './MyProposalsLauncher';
import { InviteButton } from '../sessions/InviteButton';
import { SessionJoinNotices } from '../sessions/SessionJoinNotices';
import { useFocusQuestion } from '../sessions/useFocusQuestion';
import { useSetQuestionPhase } from '../sessions/useSetQuestionPhase';
import {
  MuteAllButton,
  PeoplePanel,
  SidePanel,
  anyoneToMute,
  mergeRoster,
  useSidePanel,
  type CallView,
  type SidePanelControl,
} from '../sidepanel';
import { CreativeStudio } from '../tools/CreativeStudio';
import { CreativeToolsProvider } from '../tools/CreativeToolsProvider';
import { ImageImportProvider } from '../tools/image/ImageImportProvider';
import { ShortlistBar } from '../voting/ShortlistBar';
import { ShortlistPrompt } from '../voting/ShortlistPrompt';
import { useVoting } from '../voting/useVoting';
import { VotingBallot } from '../voting/VotingBallot';
import {
  MicToggle,
  PeopleSnapshot,
  VoiceNotice,
  VoiceReconnect,
  presenceParticipants,
  useLeaderMute,
  useVoiceRoom,
} from '../voice';
import { PinboardCanvas } from './PinboardCanvas';
import { SessionClock } from './SessionClock';
import { useArchivedBoard } from './useArchivedBoard';
import { usePinboard } from './usePinboard';

/** The viewing bar's buttons: the way back, and the leader's "Show everyone". */
const BAR_PRIMARY =
  'h-9 rounded-full bg-rt-secondary px-4 text-[12.5px] font-semibold whitespace-nowrap text-rt-ink transition-colors enabled:hover:bg-rt-secondary-deep enabled:hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rt-secondary disabled:opacity-60';
const BAR_SECONDARY =
  'inline-flex h-9 items-center gap-1.5 rounded-full border border-rt-tertiary bg-white px-4 text-[12.5px] font-semibold whitespace-nowrap text-rt-ink-muted transition-colors enabled:hover:border-rt-ink-faint enabled:hover:text-rt-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rt-secondary disabled:opacity-60';

/** Nothing on another question's board is new to this person. */
const NO_NEW_ITEMS: ReadonlySet<string> = new Set();
const NO_SHORTLIST: string[] = [];

function BoardFrame({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex h-screen flex-col bg-rt-surface text-rt-ink">
      {/* The board header's height and edges, so nothing jumps when it loads. */}
      <header className="flex h-13 shrink-0 items-center gap-3.5 border-b border-rt-secondary/40 bg-rt-secondary-wash px-5 text-rt-ink">
        <RoundTableLogo className="h-6.5 w-auto shrink-0" />
        <span className="text-[13px] font-semibold tracking-[-0.01em]">Loading session…</span>
      </header>
      <div
        className="relative min-h-0 flex-1 bg-rt-surface"
        style={{
          backgroundImage: 'radial-gradient(rgba(224,163,60,0.35) 1.4px, transparent 1.4px)',
          backgroundSize: '24px 24px',
        }}
      >
        <div className="flex h-full items-center justify-center">{children}</div>
      </div>
    </main>
  );
}

interface SessionPinboardProps {
  /**
   * Decides which of the two exits the header offers: "Leave session" for a
   * member (F07), "End session" for the leader (F32). Required, not
   * defaulted — guessing would silently drop someone's only way out.
   */
  isLeader: boolean;
  /** The agenda F24 renders beside the board, from `SessionRouter`'s fetch. */
  questions: Question[];
  /** Still joinable while the session is live: the header's Invite and People's footer. */
  joinCode: string | null;
  /** Live call or no call. With no call the board never joins a LiveKit room. */
  voiceEnabled: boolean;
  /** When the leader started the session (F09), for the header's running time. */
  startedAt: string | Date | null;
  /**
   * Which side panel feature is open, from the router, so what was open in the
   * waiting room stays open here. Left out, the board holds its own.
   */
  sidePanel?: SidePanelControl;
}

export function SessionPinboard({
  isLeader,
  questions,
  joinCode,
  voiceEnabled,
  startedAt,
  sidePanel: heldPanel,
}: SessionPinboardProps) {
  const { id } = useParams<{ id: string }>();
  const sessionId = id ?? '';
  const selectedProposalId = useRef<string | undefined>(undefined);
  const onSelectProposal = useCallback((proposalId: string) => {
    selectedProposalId.current = proposalId;
  }, []);
  const getAssistantContext = useCallback(
    () => (selectedProposalId.current ? { selectedProposalId: selectedProposalId.current } : {}),
    [],
  );
  const {
    board,
    loading,
    error,
    reload,
    setBoardLocked,
    propose,
    editProposal,
    arrangeProposal,
    deleteProposal,
    reactToProposal,
    isLive,
    newItemIds,
    viewerId,
    participants,
  } = usePinboard(sessionId);
  const voting = useVoting(sessionId, board?.questionId ?? null);

  // Another question's board this person is looking at, on their screen only:
  // finished or still to come, it moves nobody else's. `null` follows the room.
  const [viewingId, setViewingId] = useState<string | null>(null);
  const viewed = useArchivedBoard(sessionId, viewingId);
  // The room's question when they went to look, so they can be told it moved.
  const roomWhenViewing = useRef<string | null>(null);
  const roomQuestionId = board?.questionId ?? null;
  const ballotUp = voting.phase === 'open' || voting.phase === 'closed';

  // The leader putting a question's board up for the whole room, on purpose,
  // and taking the room back to the question in play.
  const { focus: focusRoom, busyQuestionId: focusBusyId } = useFocusQuestion(sessionId);
  useEffect(() => {
    // The room arriving at the question they were looking at: they are live.
    if (viewingId !== null && viewingId === roomQuestionId) setViewingId(null);
  }, [viewingId, roomQuestionId]);
  useEffect(() => {
    // A vote is everyone's moment, and its ballot covers the board anyway.
    if (ballotUp) setViewingId(null);
  }, [ballotUp]);
  // The board the leader has put up for everyone, when it is not the question
  // in play. Each time it changes, whoever was looking at another question is
  // brought to it, once, like everyone else; they can step away again after.
  const liveQuestionId =
    questions.find((question) => question.status === 'discussion' || question.status === 'voting')
      ?.id ?? null;
  const shownToEveryoneId =
    roomQuestionId && liveQuestionId && roomQuestionId !== liveQuestionId ? roomQuestionId : null;
  useEffect(() => {
    if (shownToEveryoneId) setViewingId(null);
  }, [shownToEveryoneId]);
  useEffect(() => {
    if (viewingId === null) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      // Escape in a field or a dialog is theirs, not a way back.
      const target = event.target as HTMLElement | null;
      if (target?.closest('input, textarea, select, [contenteditable="true"], [role="dialog"]')) {
        return;
      }
      setViewingId(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [viewingId]);
  const {
    setPhase,
    busyQuestionId: phaseBusyId,
    error: phaseError,
  } = useSetQuestionPhase(sessionId);
  // Entering the session view joins the room; leaving it (or ending the
  // session) unmounts this and disconnects — F11's connect/disconnect points.
  // Called before any early return so the room is not torn down and rebuilt
  // every time the board flips between loading, error and loaded.
  const voice = useVoiceRoom(sessionId, voiceEnabled);

  // The room's own name for us, minted into the token server-side — the only
  // name F12's toggle can show that is guaranteed to match what the rest of the
  // room sees beside our audio.
  const selfName = voice.participants.find((p) => p.isLocal)?.name ?? null;

  // The roster for a session with no call, from who is connected to the board
  // rather than who is in a LiveKit room. Memoised, and up here before the
  // early returns: the chip's speaking tracker re-runs whenever this array
  // changes, so it must not be a new one on every render.
  const presenceRoster = useMemo(
    () => presenceParticipants(participants, viewerId),
    [participants, viewerId],
  );

  // The side panel's state, and the call as the People tab reads it. Up here
  // with the rest of the hooks, for the same early-return reason; the call is
  // memoised so People's speaking tracker is not handed a new roster each render.
  const ownPanel = useSidePanel();
  const sidePanel = heldPanel ?? ownPanel;
  const call = useMemo<CallView | null>(
    () =>
      voiceEnabled
        ? { participants: voice.participants, status: voice.status, micStatus: voice.micStatus }
        : null,
    [voiceEnabled, voice.participants, voice.status, voice.micStatus],
  );
  // Everyone in the session once, call or not: what the header's snapshot
  // shows and People counts, so the two never disagree.
  const roster = useMemo(() => mergeRoster(presenceRoster, call), [presenceRoster, call]);
  // The leader's mute buttons (F12). The hook is harmless for anyone else; it
  // only ever acts when one of its buttons is pressed, and only the leader
  // gets them. The server checks again regardless.
  const leaderMute = useLeaderMute(sessionId);
  const canMuteAnyone = useMemo(() => anyoneToMute(presenceRoster, call), [presenceRoster, call]);
  // Not on a server with no LiveKit: there is no call to mute anyone in, and
  // a greyed "Mute all" would only raise the question why.
  const moderating = isLeader && call !== null && call.status !== 'unavailable';

  if (!sessionId) {
    return (
      <main className="flex h-screen items-center justify-center bg-rt-surface">
        <p className="text-rt-ink-muted">Missing session id.</p>
      </main>
    );
  }

  if (loading) {
    return (
      <BoardFrame>
        <p className="text-[13px] text-rt-ink-muted">Loading pinboard…</p>
      </BoardFrame>
    );
  }

  // Only when there is nothing to show: if the REST load failed but the socket
  // snapshot produced a board, the board is what the user wants to see.
  if (error && !board) {
    return (
      <BoardFrame>
        <div className="relative w-[400px] border border-rt-ink bg-rt-surface">
          <span className="pointer-events-none absolute -left-1 -top-1.5 text-[12px] leading-none text-rt-secondary">
            +
          </span>
          <span className="pointer-events-none absolute -right-1 -top-1.5 text-[12px] leading-none text-rt-secondary">
            +
          </span>
          <span className="pointer-events-none absolute -bottom-1.5 -left-1 text-[12px] leading-none text-rt-secondary">
            +
          </span>
          <span className="pointer-events-none absolute -bottom-1.5 -right-1 text-[12px] leading-none text-rt-secondary">
            +
          </span>
          <div className="border-b border-rt-tertiary bg-rt-surface-alt px-3.5 py-2 text-[9px] font-semibold tracking-[0.16em] text-rt-ink-faint uppercase">
            Load failed
          </div>
          <div className="p-5 text-center">
            <p className="text-[19px] font-semibold tracking-[-0.01em] text-rt-ink">
              Could not load board
            </p>
            <p className="mt-2 text-[13px] leading-relaxed text-rt-ink-muted">{error}</p>
            <button
              type="button"
              onClick={() => void reload()}
              className="mt-5 rounded-full bg-rt-secondary px-[18px] py-[9px] text-[12px] font-semibold text-rt-ink hover:bg-rt-secondary-deep hover:text-white focus:outline focus:outline-2 focus:outline-offset-2 focus:outline-rt-secondary"
            >
              Retry
            </button>
          </div>
        </div>
      </BoardFrame>
    );
  }

  if (!board) {
    return (
      <BoardFrame>
        <p className="text-[13px] text-rt-ink-muted">Board unavailable.</p>
      </BoardFrame>
    );
  }

  // Plain expressions rather than memos: everything above this point can
  // return early, and a hook here would run on some renders and not others.
  const acceptsProposals = isLive && board.questionStatus === 'discussion';

  // What makes the "my proposals" list stale: the board moving to a different
  // question, and this member adding, removing or rewording something on it.
  // Other people's cards are left out because the list never shows them.
  const myProposalsRevision = [
    board.questionId ?? 'none',
    board.items
      .filter((item) => item.authorId === viewerId)
      .map((item) => `${item.id}${item.editedAt ?? ''}`)
      .join(','),
  ].join('|');

  // F41: read from the agenda, which `questionUpdated` keeps current, rather
  // than the board snapshot — the leader can flip it while the board is open.
  const questionVotingEnabled =
    questions.find((question) => question.id === board.questionId)?.votingEnabled ?? true;
  // The wording too: the leader can reword the question the room is on until
  // voting opens, and the board's header and ballot should say what it says now.
  const questionText =
    questions.find((question) => question.id === board.questionId)?.text ?? board.questionText;
  const shownBoard = questionText === board.questionText ? board : { ...board, questionText };

  // The question being looked at instead of the room's, and its board: the
  // one fetched once it has arrived, the question's own words over an empty
  // board until then (and for a question still to come, which has none yet).
  const viewingQuestion =
    viewingId !== null && viewingId !== board.questionId
      ? questions.find((question) => question.id === viewingId)
      : undefined;
  const viewedBoard: BoardResponse | null = viewingQuestion
    ? viewed.board && viewed.board.questionId === viewingQuestion.id
      ? { ...viewed.board, questionText: viewingQuestion.text }
      : {
          ...board,
          questionId: viewingQuestion.id,
          questionText: viewingQuestion.text,
          questionPosition: viewingQuestion.position,
          questionStatus: viewingQuestion.status,
          boardLocked: false,
          items: [],
          discussionTimer: null,
        }
    : null;
  const roomPosition = questions.findIndex((question) => question.id === board.questionId);
  // The room's board is not the question in play: the leader has put another
  // up for everyone (or a session was left that way). Everyone is told, its
  // row is marked, and the leader can take the room back.
  const openQuestion = questions.find(
    (question) => question.status === 'discussion' || question.status === 'voting',
  );
  const presenting =
    openQuestion && board.questionId && board.questionId !== openQuestion.id
      ? questions.find((question) => question.id === board.questionId)
      : undefined;
  const roomShowing = viewingQuestion ? undefined : presenting;
  // "Viewing Q1", and after it only what the screen does not already say: that
  // everyone is on a board the leader put up, that the room has moved on, or
  // that the question has not started. How a finished one ended is on its
  // agenda row and in the header already. While a board is up for everyone,
  // the way back is to it.
  const viewingTitle = viewingQuestion ? `Viewing Q${questions.indexOf(viewingQuestion) + 1}` : '';
  const viewingDetail = !viewingQuestion
    ? ''
    : viewed.error
      ? 'Could not load this board'
      : presenting
        ? `Everyone is on Q${roomPosition + 1}`
        : roomWhenViewing.current !== board.questionId && roomPosition !== -1
          ? `The room is on Q${roomPosition + 1} now`
          : viewingQuestion.status === 'pending'
            ? 'Not started'
            : '';
  const backLabel = presenting ? `Back to Q${roomPosition + 1}` : 'Back to live';

  const view = (questionId: string | null) => {
    if (questionId === null || questionId === board.questionId) {
      setViewingId(null);
      return;
    }
    roomWhenViewing.current = board.questionId;
    setViewingId(questionId);
  };

  const selecting = board.questionStatus === 'voting' && voting.phase === 'shortlisting';
  const balloting = voting.phase === 'open' || voting.phase === 'closed';
  // Server already ordered the shortlist (winner / ties first when closed).
  const ballotItems = voting.proposalIds
    .map((id) => board.items.find((item) => item.id === id))
    .filter((item): item is NonNullable<typeof item> => item !== undefined);

  return (
    <CreativeToolsProvider
      sessionId={sessionId}
      questionId={board.questionId ?? ''}
      isLive={acceptsProposals && !viewingQuestion}
      viewerId={viewerId}
      proposals={board.items}
      propose={propose}
      editProposal={editProposal}
    >
      {/* Inside the tools, since an imported picture is proposed through them,
          and around the whole page, since a picture can arrive from the
          toolbar, a drop on the board, or a paste. */}
      <ImageImportProvider>
        {/* `overflow-hidden` so nothing on the board can produce a page-level
          scrollbar; `h-dvh` so mobile browser chrome does not cut it off. */}
        <main className="h-dvh overflow-hidden">
          <PinboardCanvas
            board={viewedBoard ?? shownBoard}
            questionVotingEnabled={viewingQuestion?.votingEnabled ?? questionVotingEnabled}
            isLive={isLive}
            newItemIds={viewingQuestion ? NO_NEW_ITEMS : newItemIds}
            viewing={
              viewingQuestion
                ? {
                    title: viewingTitle,
                    detail: viewingDetail,
                    actions: (
                      <>
                        {isLeader ? (
                          <button
                            type="button"
                            onClick={() => void focusRoom(viewingQuestion.id)}
                            disabled={focusBusyId !== null}
                            className={BAR_SECONDARY}
                          >
                            <ScreenShare aria-hidden size={14} strokeWidth={2} />
                            Show everyone
                          </button>
                        ) : null}
                        <button
                          type="button"
                          onClick={() => setViewingId(null)}
                          className={BAR_PRIMARY}
                        >
                          {backLabel}
                        </button>
                      </>
                    ),
                  }
                : roomShowing && openQuestion
                  ? {
                      shared: true,
                      title: `Showing Q${questions.indexOf(roomShowing) + 1}`,
                      detail: isLeader
                        ? 'Everyone can see this'
                        : 'The leader is showing this to everyone',
                      actions: isLeader ? (
                        <button
                          type="button"
                          onClick={() => void focusRoom(openQuestion.id)}
                          disabled={focusBusyId !== null}
                          className={BAR_PRIMARY}
                        >
                          Back to live
                        </button>
                      ) : null,
                    }
                  : null
            }
            isLeader={isLeader}
            viewerId={viewerId}
            editProposal={editProposal}
            arrangeProposal={arrangeProposal}
            deleteProposal={deleteProposal}
            shortlist={viewingQuestion ? NO_SHORTLIST : voting.proposalIds}
            canToggleShortlist={isLeader && selecting && !voting.locked && !viewingQuestion}
            onToggleShortlist={voting.toggle}
            shortlistControl={
              selecting && !viewingQuestion ? (
                <ShortlistBar isLeader={isLeader} count={voting.proposalIds.length} />
              ) : null
            }
            boardOverlay={
              selecting && isLeader && !viewingQuestion ? (
                <ShortlistPrompt
                  count={voting.proposalIds.length}
                  busy={voting.busy || phaseBusyId === board.questionId}
                  error={voting.error ?? phaseError}
                  limitHits={voting.limitHits}
                  onProceed={() => void voting.startVote()}
                  onClear={() => void voting.clear()}
                  onBack={() => {
                    if (board.questionId) void setPhase(board.questionId, 'discussion');
                  }}
                />
              ) : null
            }
            ballot={
              balloting ? (
                <VotingBallot
                  questionText={questionText}
                  items={ballotItems}
                  tallies={voting.tallies}
                  myVote={voting.myVote}
                  votedCount={voting.votedCount}
                  voterCount={voting.voterCount}
                  isLeader={isLeader}
                  viewerId={viewerId}
                  leaderId={board.leaderId}
                  voterStatuses={voting.voterStatuses}
                  winnerProposalId={voting.winnerProposalId}
                  tiedProposalIds={voting.tiedProposalIds}
                  votingEndsAt={voting.votingEndsAt}
                  phase={voting.phase === 'closed' ? 'closed' : 'open'}
                  busy={voting.busy}
                  error={voting.error}
                  onVote={(id) => void voting.castVote(id)}
                  onClose={() => void voting.closeVote()}
                  onContinue={() => void voting.continueVote()}
                />
              ) : null
            }
            agenda={
              <AgendaPanel
                sessionId={sessionId}
                questions={questions}
                viewingQuestionId={viewingQuestion?.id ?? null}
                showingQuestionId={presenting?.id ?? null}
                onView={view}
                isLeader={isLeader}
                votingPhase={voting.phase}
                hasProposals={
                  board.questionStatus === 'discussion'
                    ? board.items.length >= SHORTLIST_MIN
                    : undefined
                }
                proposalCount={
                  board.questionStatus === 'discussion' ? board.items.length : undefined
                }
              />
            }
            boardLock={{
              locked: viewedBoard ? viewedBoard.boardLocked : board.boardLocked,
              onToggle:
                isLeader && board.questionId
                  ? () => setBoardLocked(board.questionId!, !board.boardLocked)
                  : undefined,
            }}
            myProposals={
              <MyProposalsLauncher
                sessionId={sessionId}
                revision={myProposalsRevision}
                canPropose={acceptsProposals && !viewingQuestion}
              />
            }
            voiceNotice={
              <VoiceNotice
                stacked
                status={voice.status}
                micStatus={voice.micStatus}
                micPermissionDenied={voice.micPermissionDenied}
                error={voice.error}
                audioBlocked={voice.audioBlocked}
                mutedByLeader={voice.mutedByLeader}
                retry={voice.retry}
                requestMicrophone={voice.requestMicrophone}
                unlockAudio={voice.unlockAudio}
              />
            }
            micControl={
              // Only one of these two is ever drawn: the mic, or — once voice
              // has given up — its Reconnect in the mic's place. A session
              // with no call has neither; its status line says "No call".
              voiceEnabled ? (
                <>
                  <VoiceReconnect status={voice.status} error={voice.error} retry={voice.retry} />
                  <MicToggle
                    compact
                    name={selfName}
                    micEnabled={voice.micEnabled}
                    micStatus={voice.micStatus}
                    status={voice.status}
                    busy={voice.micBusy}
                    toggle={voice.toggleMic}
                  />
                </>
              ) : null
            }
            noCall={!voiceEnabled}
            participants={
              // Call or not, everyone in the session: the board's presence,
              // with the call's mic and speaking state where there is one.
              <PeopleSnapshot
                participants={roster}
                leaderId={board.leaderId}
                onToggle={() => sidePanel.toggle('people')}
                listOpen={sidePanel.tab === 'people'}
              />
            }
            invite={joinCode ? <InviteButton code={joinCode} /> : null}
            clock={<SessionClock startedAt={startedAt} />}
            reactToProposal={reactToProposal}
            onSelectProposal={onSelectProposal}
            // The room's discussion clock, the only place it is shown. Kept
            // while this person looks at another question's board, named for
            // the question it times, since the line beside it then describes
            // the board being looked at instead.
            headerTimer={
              board.discussionTimer &&
              (board.questionStatus === 'discussion' ||
                (board.questionStatus === 'voting' && voting.phase === 'shortlisting')) ? (
                <span>
                  {viewingQuestion && board.questionPosition != null
                    ? `Q${board.questionPosition + 1}: `
                    : null}
                  <PhaseTimer
                    inline
                    startedAt={board.discussionTimer.startedAt}
                    durationSeconds={board.discussionTimer.durationSeconds}
                    allowOvertime
                    label={
                      viewingQuestion && board.questionPosition != null
                        ? `Question ${board.questionPosition + 1} discussion`
                        : 'Discussion'
                    }
                  />
                </span>
              ) : null
            }
            sidePanel={
              /* Propose reads these items so it can unlock after a delete. The model
                still reads the board server-side on every turn (F35). */
              <SidePanel
                key={sessionId}
                control={sidePanel}
                suppressed={balloting}
                people={
                  <PeoplePanel
                    present={presenceRoster}
                    call={call}
                    leaderId={board.leaderId}
                    joinCode={joinCode}
                    boardLive={isLive}
                    {...(moderating ? { moderation: leaderMute } : {})}
                  />
                }
                peopleCount={roster.length}
                peopleAction={
                  moderating ? (
                    <MuteAllButton moderation={leaderMute} anyoneToMute={canMuteAnyone} />
                  ) : null
                }
                sessionId={sessionId}
                getContext={getAssistantContext}
                boardItems={board.items}
                questionStatus={board.questionStatus}
              />
            }
          />
          <SessionJoinNotices />
        </main>
        <CreativeStudio />
      </ImageImportProvider>
    </CreativeToolsProvider>
  );
}
