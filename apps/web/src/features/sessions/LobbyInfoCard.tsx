import { useState } from 'react';
import { Link, Maximize } from 'lucide-react';

import { Tooltip } from '../../components/ui/Tooltip';
import { ParticipantBubble } from '../voice/ParticipantBubble';
import { CodeTiles } from './CodeTiles';
import { joinLink } from './joinLink';
import { PresentInvite } from './PresentInvite';
import { useInviteCopy } from './useInviteCopy';
import { initialsFromName, swatchForId } from './waitingRoomSeats';

const PRIMARY =
  'inline-flex h-[34px] flex-1 items-center justify-center gap-1.5 rounded-full bg-rt-secondary px-3.5 text-[12.5px] font-semibold whitespace-nowrap text-rt-ink transition-colors hover:bg-rt-secondary-deep hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rt-secondary';
const SECONDARY =
  'inline-flex h-[34px] items-center rounded-full border border-rt-tertiary bg-white px-3 text-[12px] font-semibold whitespace-nowrap text-rt-ink transition-colors hover:bg-rt-ink/4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rt-secondary';
const ROUND =
  'flex size-[34px] shrink-0 items-center justify-center rounded-full border border-rt-tertiary bg-white text-rt-ink transition-colors hover:bg-rt-ink/4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rt-secondary';

interface LobbyInfoCardProps {
  title: string;
  leaderId: string | null;
  /** The leader's name, when it is known (they may never have been seen yet). */
  leaderName: string | null;
  /**
   * Whether the leader is in the room. Null while presence is not known yet,
   * so the card does not call them away before the room has said.
   */
  leaderHere: boolean | null;
  /** Null once the session cannot be joined (it never is, in the lobby). */
  code: string | null;
  /** The room has just opened: the code's tiles flip in, one after another. */
  codeArriving?: boolean;
}

/**
 * The waiting room's left-hand card: what the session is, who runs it, and the
 * way in for anyone still to come.
 *
 * The title is not a heading here: the header carries it as the page's one
 * `h1`. The invite shows the code as tiles to read out across a room, copies
 * the link (the usual way in) or the code, and can put both up full-screen.
 */
export function LobbyInfoCard({
  title,
  leaderId,
  leaderName,
  leaderHere,
  code,
  codeArriving = false,
}: LobbyInfoCardProps) {
  const { copied, failed, copy } = useInviteCopy<'link' | 'code'>();
  const [presenting, setPresenting] = useState(false);
  const link = code ? joinLink(code) : null;

  return (
    <div className="rt-lobby-panel">
      <p className="text-[19px] leading-snug font-semibold tracking-[-0.015em] text-rt-ink">
        {title}
      </p>

      {leaderId ? (
        <div className="mt-3 flex items-center gap-2.5 text-[12.5px] text-rt-ink-muted [--rt-seat-surface:#fffcf6]">
          <ParticipantBubble
            initials={initialsFromName(leaderName ?? '?')}
            swatch={swatchForId(leaderId)}
            isSpeaking={false}
            isMuted={false}
            isLeader
            size="row"
          />
          <p>
            Hosted by{' '}
            <span className="font-semibold text-rt-ink">{leaderName ?? 'the leader'}</span>
            {leaderHere === false ? <span className="text-[#b45309]"> · not here yet</span> : null}
          </p>
        </div>
      ) : null}

      {code && link ? (
        <>
          <div aria-hidden="true" className="my-4 h-px bg-rt-secondary/25" />
          <p className="mb-2.5 text-[10px] font-semibold tracking-[0.16em] text-rt-ink-faint uppercase">
            Invite
          </p>
          <div className={codeArriving ? 'rt-code-arrive' : undefined}>
            <CodeTiles code={code} />
          </div>
          <div className="mt-3 flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => void copy('link', link)}
              aria-label="Copy invite link"
              className={PRIMARY}
            >
              <Link aria-hidden="true" size={14} strokeWidth={2} />
              {copied === 'link' ? 'Copied' : 'Copy link'}
            </button>
            <button
              type="button"
              onClick={() => void copy('code', code)}
              aria-label="Copy join code"
              className={SECONDARY}
            >
              {copied === 'code' ? 'Copied' : 'Copy code'}
            </button>
            {/* On the page, not in the card: the card scrolls, so a bubble
                inside it is cut off and pushes out a scrollbar. */}
            <Tooltip label="Show the code full-screen" placement="bottom" portal>
              <button
                type="button"
                onClick={() => setPresenting(true)}
                aria-label="Present the invite"
                aria-haspopup="dialog"
                className={ROUND}
              >
                <Maximize aria-hidden="true" size={15} strokeWidth={1.8} />
              </button>
            </Tooltip>
          </div>
          {failed === 'link' ? (
            // Where the link can be selected by hand when copying fails.
            <input
              readOnly
              value={link}
              aria-label="Invite link"
              onFocus={(event) => event.currentTarget.select()}
              className="mt-2.5 w-full truncate rounded-lg border border-rt-tertiary/70 bg-white px-2.5 py-1.5 text-[12px] text-rt-ink outline-none focus-visible:ring-2 focus-visible:ring-rt-secondary"
            />
          ) : null}
          {/* Spoken as well as shown: the buttons keep their names. */}
          <p role="status" className={failed ? 'mt-2 text-[11px] text-rt-ink-muted' : 'sr-only'}>
            {failed === 'link'
              ? 'Could not copy automatically. Select the link above and copy it yourself.'
              : failed === 'code'
                ? `Could not copy automatically. The code is ${code}.`
                : copied
                  ? 'Copied'
                  : ''}
          </p>
          <p className="mt-2 text-[11px] leading-snug text-rt-ink-faint">
            Anyone with the link or the code can join until the session ends.
          </p>
          {presenting ? (
            <PresentInvite
              code={code}
              link={link.replace(/^https?:\/\//, '')}
              title={title}
              onClose={() => setPresenting(false)}
            />
          ) : null}
        </>
      ) : null}
    </div>
  );
}
