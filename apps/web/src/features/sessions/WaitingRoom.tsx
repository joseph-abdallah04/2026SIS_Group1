import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

import { ConfirmDialog } from '../../components/ui/ConfirmDialog';

import { useMediaQuery } from '../../components/ui/useMediaQuery';
import { BoardHeader } from '../pinboard/BoardHeader';
import {
  MuteAllButton,
  PeoplePanel,
  SidePanelFrame,
  anyoneToMute,
  mergeRoster,
  useSidePanel,
  type CallView,
  type SidePanelControl,
} from '../sidepanel';
import {
  MicToggle,
  PeopleSnapshot,
  VoiceNotice,
  VoiceReconnect,
  localName,
  presenceParticipants,
  useLeaderMute,
  useVoiceRoom,
} from '../voice';
import { useCurrentUserId } from '../../lib/currentUser';
import type { SessionDetail } from './useSessionDetail';
import { EndSessionControl } from './EndSessionControl';
import { LeaveSessionControl } from './LeaveSessionControl';
import { LobbyAgenda } from './LobbyAgenda';
import { LobbyInfoCard } from './LobbyInfoCard';
import { LobbyPhoneBar, LobbyPhoneSheet } from './LobbyPhonePanel';
import { SessionJoinNotices } from './SessionJoinNotices';
import { useStartMoment } from './useStartMoment';
import { useStartSession } from './useStartSession';
import { useWaitingRoom, type LobbyExit } from './useWaitingRoom';
import { WaitingRoomTable } from './WaitingRoomTable';

/** The studio's phone breakpoint, so the two agree on what a phone is. */
const PHONE = '(max-width: 639px)';
const REDUCED_MOTION = '(prefers-reduced-motion: reduce)';

interface WaitingRoomProps {
  session: SessionDetail;
  /**
   * `SessionRouter`'s `refresh`: called once the session is no longer waiting.
   * After a Start (the broadcast, or the leader's own press going through),
   * once the 3-2-1 has played; at once for a rejoin snapshot that says the
   * session already started or ended. The router re-reads the session and
   * swaps this page for the board or the ended page in one render (F09).
   */
  onLeftLobby: () => void;
  /**
   * Which side panel feature is open. Held by the router, so whatever is open
   * when the session starts is still open on the board. Left out (in tests),
   * the lobby holds its own.
   */
  sidePanel?: SidePanelControl;
  /** The leader has just opened the room: the join code flips in, once. */
  justOpened?: boolean;
}

function questionCount(n: number): string {
  if (n === 0) return 'No questions yet';
  return n === 1 ? '1 question' : `${n} questions`;
}

function peopleSeated(n: number): string {
  return n === 1 ? '1 seated' : `${n} seated`;
}

/**
 * F08's live lobby: everyone sits round a table until the leader starts.
 *
 * The header and the side panel are the board's own, so the page's frame does
 * not change at Start. Between them, three zones: what the session is and the
 * way in for anyone still to come, the table, and the questions ahead. With
 * less room the questions fold under the card; on a phone, or beside the open
 * panel at laptop widths, the table comes first and the cards scroll under it,
 * and on a phone People and Chat rise from a bar along the bottom.
 */
export function WaitingRoom({
  session,
  onLeftLobby,
  sidePanel: heldPanel,
  justOpened = false,
}: WaitingRoomProps) {
  const reduceMotion = useMediaQuery(REDUCED_MOTION);
  // The 3-2-1 everyone sees when the leader starts, then the board.
  const { moment, begin: beginStartMoment } = useStartMoment(onLeftLobby, reduceMotion);
  const handleLeftLobby = useCallback(
    (why: LobbyExit) => {
      // News of a start (or an end) that already happened has no moment left
      // to share: straight to wherever the room is now.
      if (why === 'started') beginStartMoment();
      else onLeftLobby();
    },
    [beginStartMoment, onLeftLobby],
  );
  const {
    participants,
    memberNames,
    viewerId: socketViewerId,
    isLive,
    joinFailed,
    retryJoin,
  } = useWaitingRoom(session.id, handleLeftLobby);
  // F13: the lobby is a room people are sitting in, so they can talk in it.
  // The connection survives the leader pressing Start — the registry hands the
  // same room to the board (features/voice/roomRegistry.ts) — so this is the
  // start of the call, not a preview of one. A session created with no call
  // never joins at all, which is what saves its LiveKit minutes.
  const voice = useVoiceRoom(session.id, session.voiceEnabled);
  const { start, starting, error: startError } = useStartSession(session.id);
  const currentUserId = useCurrentUserId();
  const isLeader = session.leaderId === currentUserId;
  // The server's word for who this socket is, as on the board; the stored
  // login until the first snapshot arrives.
  const viewerId = socketViewerId ?? currentUserId;
  const phone = useMediaQuery(PHONE);

  const ownPanel = useSidePanel();
  const panel = heldPanel ?? ownPanel;

  // Everyone in the session once each, call or not, exactly as the board
  // builds it: socket presence, with the call's mic and speaking state where
  // there is one. Memoised so the speaking trackers downstream are not handed a
  // new roster every render.
  const presenceRoster = useMemo(
    () => presenceParticipants(participants ?? [], viewerId),
    [participants, viewerId],
  );
  const call = useMemo<CallView | null>(
    () =>
      session.voiceEnabled
        ? { participants: voice.participants, status: voice.status, micStatus: voice.micStatus }
        : null,
    [session.voiceEnabled, voice.participants, voice.status, voice.micStatus],
  );
  const roster = useMemo(() => mergeRoster(presenceRoster, call), [presenceRoster, call]);
  // The leader's mute (F12) works before Start too: the server's mute route
  // asks only that the caller leads a session with a call.
  const leaderMute = useLeaderMute(session.id);
  const canMuteAnyone = useMemo(() => anyoneToMute(presenceRoster, call), [presenceRoster, call]);
  const moderating = isLeader && call !== null && call.status !== 'unavailable';

  // Null while presence is not known: nobody is called away before the room
  // has said who is in it.
  const leaderHere =
    participants === null ? null : participants.some((person) => person.id === session.leaderId);
  const leaderName = session.leaderId ? (memberNames.get(session.leaderId) ?? null) : null;
  const leaderFirstName = leaderName?.trim().split(/\s+/)[0] ?? 'the leader';

  // Starting alone is allowed, but asked about once: it is more often a slip
  // than a plan.
  const [confirmingAlone, setConfirmingAlone] = useState(false);
  const alone =
    participants !== null && participants.length === 1 && participants[0]?.id === currentUserId;

  // The broadcast plays the moment for everyone, this page included. Beginning
  // it here too covers a leader whose socket missed the broadcast.
  async function startSession() {
    setConfirmingAlone(false);
    if (await start()) beginStartMoment();
  }

  const people = (
    <PeoplePanel
      place="lobby"
      present={presenceRoster}
      call={call}
      leaderId={session.leaderId}
      joinCode={session.code}
      boardLive={isLive}
      {...(moderating ? { moderation: leaderMute } : {})}
    />
  );
  const peopleAction = moderating ? (
    <MuteAllButton moderation={leaderMute} anyoneToMute={canMuteAnyone} />
  ) : null;

  let centre: ReactNode;
  if (moment.phase === 'counting') {
    centre = (
      // Keyed by the count, so each beat pops in afresh.
      <span key={moment.count} aria-hidden="true" className="rt-table-count">
        {moment.count}
      </span>
    );
  } else if (moment.phase === 'lit') {
    centre = (
      <p aria-hidden="true" className="rt-table-go">
        Here we go
      </p>
    );
  } else if (joinFailed) {
    centre = (
      <>
        <p className="rt-table-wait">Couldn’t take your seat.</p>
        <button
          type="button"
          onClick={retryJoin}
          className="mt-2.5 h-8 rounded-full bg-rt-secondary px-4 text-[12.5px] font-semibold text-rt-ink transition-colors hover:bg-rt-secondary-deep hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rt-secondary"
        >
          Try again
        </button>
      </>
    );
  } else if (isLeader) {
    centre = (
      <>
        <button
          type="button"
          className="rt-table-start"
          onClick={() => (alone ? setConfirmingAlone(true) : void startSession())}
          disabled={starting}
        >
          {starting ? 'Starting…' : alone ? 'Start anyway' : 'Start session'}
          {participants && !starting ? (
            <span className="rt-table-start-count">
              {/* A pause for a screen reader between the action and the count. */}
              <span className="sr-only">,</span>{' '}
              {alone ? 'Only you so far' : peopleSeated(participants.length)}
            </span>
          ) : null}
        </button>
        {startError ? (
          <p role="alert" className="mt-3 max-w-48 text-[12px] text-red-600">
            {startError}
          </p>
        ) : null}
      </>
    );
  } else if (participants === null) {
    centre = <p className="rt-table-wait">Taking your seat…</p>;
  } else {
    centre = (
      <>
        <p className="rt-table-wait">
          Waiting for {leaderFirstName} to {leaderHere ? 'start' : 'arrive'}
          <span aria-hidden="true" className="rt-table-dots" />
        </p>
        <p className="rt-table-wait-sub">{peopleSeated(participants.length)} · the table’s set</p>
      </>
    );
  }

  return (
    <main className="flex h-dvh min-h-0 flex-col overflow-hidden text-rt-ink">
      <BoardHeader
        question={null}
        sessionTitle={session.title}
        questionNumber={null}
        phase="Waiting room"
        // A phone's status line has room for the state and the connection only;
        // the questions are on the page.
        phaseDetails={phone ? [] : [questionCount(session.questions.length)]}
        // Before the first join lands this reads "Reconnecting…", as the board
        // does; a join the server refused stays there instead of hanging on
        // "Connecting…" with nothing to say why.
        connection={isLive ? 'waiting' : 'reconnecting'}
        noCall={!session.voiceEnabled}
        // On a phone the bottom bar opens People, and the header needs the room.
        people={
          phone ? undefined : (
            <PeopleSnapshot
              participants={roster}
              leaderId={session.leaderId}
              onToggle={() => panel.toggle('people')}
              listOpen={panel.tab === 'people'}
            />
          )
        }
        // Only one of these two is ever drawn: the mic, or — once voice has
        // given up — its Reconnect in the mic's place. A session with no call
        // has neither; its status line says "No call". No Invite here, unlike
        // the board: the info card holds the code, Copy link and Present, and
        // People has its own invite.
        controls={
          session.voiceEnabled ? (
            <>
              <VoiceReconnect status={voice.status} error={voice.error} retry={voice.retry} />
              <MicToggle
                compact
                name={localName(voice.participants)}
                micEnabled={voice.micEnabled}
                micStatus={voice.micStatus}
                status={voice.status}
                busy={voice.micBusy}
                toggle={voice.toggleMic}
              />
            </>
          ) : undefined
        }
        exit={
          isLeader ? (
            <EndSessionControl sessionId={session.id} variant="header" />
          ) : (
            <LeaveSessionControl sessionId={session.id} variant="header" />
          )
        }
      />

      {/* A full-height row, which the side panel's rail needs; on a phone, the
          box its sheet rises in. */}
      <div className="relative flex min-h-0 flex-1">
        <div className="rt-lobby-main">
          {/* Anchored to the content rather than the page, so the banner hangs
              just under the header instead of on top of it. */}
          <VoiceNotice
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
          <div className="rt-lobby-grid">
            <aside aria-label="Session and invite" className="rt-lobby-card">
              <LobbyInfoCard
                title={session.title}
                leaderId={session.leaderId}
                leaderName={leaderName}
                leaderHere={leaderHere}
                code={session.code}
                codeArriving={justOpened}
              />
            </aside>
            <section aria-label="The table" className="rt-lobby-stage rt-table-stage">
              <WaitingRoomTable
                participants={participants}
                leaderId={session.leaderId}
                viewerId={viewerId}
                voiceParticipants={voice.participants}
                small={phone}
                orbit={!isLeader && participants !== null && !joinFailed && moment.phase === 'idle'}
                {...(moment.phase === 'lit' ? { mood: 'lit' as const } : {})}
              >
                {centre}
              </WaitingRoomTable>
            </section>
            <div className="rt-lobby-agenda">
              <LobbyAgenda
                questions={session.questions}
                discussionTimerSeconds={session.discussionTimerSeconds}
                votingTimerSeconds={session.votingTimerSeconds}
              />
            </div>
          </div>
        </div>

        {/* The board's People and Chat, with no assistant: there is no board
            for it to read yet. */}
        {phone ? (
          <LobbyPhoneSheet
            control={panel}
            people={people}
            peopleCount={roster.length}
            peopleAction={peopleAction}
          />
        ) : (
          <SidePanelFrame
            control={panel}
            people={people}
            peopleCount={roster.length}
            peopleAction={peopleAction}
          />
        )}
      </div>
      {phone ? <LobbyPhoneBar control={panel} /> : null}

      {/* The countdown is drawn, not read out: one plain sentence instead. */}
      <p role="status" className="sr-only">
        {moment.phase === 'idle' ? '' : 'The session is starting.'}
      </p>
      {/* "Priya joined", as on the board: outside the lobby's layout, which as
          a size container would hold anything fixed inside it. */}
      <SessionJoinNotices />
      {confirmingAlone
        ? createPortal(
            <ConfirmDialog
              title="You’re the only one here"
              confirmLabel="Start anyway"
              confirmingLabel="Starting…"
              cancelLabel="Wait"
              tone="primary"
              busy={starting}
              onConfirm={() => void startSession()}
              onCancel={() => setConfirmingAlone(false)}
            >
              Nobody else has taken a seat yet. Start anyway? Anyone with the code can still join
              while the session runs.
            </ConfirmDialog>,
            document.body,
          )
        : null}
    </main>
  );
}
