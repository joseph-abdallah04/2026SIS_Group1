import { useCallback, useRef, useState } from 'react';
import { Link, UserPlus } from 'lucide-react';

import { AnchoredPopover } from '../../components/ui/AnchoredPopover';
import { Tooltip } from '../../components/ui/Tooltip';
import { joinLink } from './joinLink';
import { useInviteCopy } from './useInviteCopy';

/** Fixed, so the popover can be placed before it renders. */
const PANEL_WIDTH = 300;
const PANEL_MAX_HEIGHT = 240;

/** The same quiet round button as the header's other icon controls. */
const TRIGGER =
  'flex size-8 shrink-0 items-center justify-center rounded-full text-rt-ink transition-colors hover:bg-rt-ink/[0.06] aria-expanded:bg-rt-ink/[0.06] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rt-secondary';

function InvitePanel({ code }: { code: string }) {
  const linkRef = useRef<HTMLInputElement>(null);
  const { copied, failed, copy } = useInviteCopy<'link' | 'code'>();
  const link = joinLink(code);

  return (
    <div className="p-3.5">
      <p className="text-[13px] font-semibold text-rt-ink">Invite people</p>
      <p className="mt-1 text-[11.5px] leading-snug text-rt-ink-muted">
        Anyone with the link or the code can join while the session is live.
      </p>
      <input
        ref={linkRef}
        readOnly
        value={link}
        aria-label="Invite link"
        onFocus={(event) => event.currentTarget.select()}
        className="mt-2.5 w-full truncate rounded-lg border border-rt-tertiary/70 bg-rt-surface-alt px-2.5 py-1.5 text-[12px] text-rt-ink outline-none focus-visible:ring-2 focus-visible:ring-rt-secondary"
      />
      <div className="mt-2.5 flex gap-1.5">
        <button
          type="button"
          onClick={() => void copy('link', link, linkRef.current)}
          className="inline-flex h-[34px] flex-1 items-center justify-center gap-1.5 rounded-full bg-rt-secondary px-3 text-[12.5px] font-semibold text-rt-ink transition-colors hover:bg-rt-secondary-deep hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rt-secondary"
        >
          <Link aria-hidden="true" size={14} strokeWidth={2} />
          {copied === 'link' ? 'Copied' : 'Copy link'}
        </button>
        <button
          type="button"
          onClick={() => void copy('code', code)}
          // The visible words, spaced: inline pieces run together otherwise.
          aria-label={`Copy code ${code}`}
          className="inline-flex h-[34px] items-center gap-1.5 rounded-full border border-rt-tertiary bg-white px-3 text-[12px] font-semibold whitespace-nowrap text-rt-ink transition-colors hover:bg-rt-ink/[0.04] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rt-secondary"
        >
          {copied === 'code' ? (
            'Copied'
          ) : (
            <>
              Copy code
              <span className="font-mono text-[12px] tracking-[0.06em] text-rt-ink-muted">
                {code}
              </span>
            </>
          )}
        </button>
      </div>
      {/* Spoken as well as shown: the buttons keep their names, so this is
          the only place the result is said. */}
      <p role="status" className={failed ? 'mt-2 text-[11px] text-rt-ink-muted' : 'sr-only'}>
        {failed === 'link'
          ? 'Could not copy automatically. Select the link above and copy it yourself.'
          : failed === 'code'
            ? `Could not copy automatically. The code is ${code}.`
            : copied
              ? 'Copied'
              : ''}
      </p>
    </div>
  );
}

/**
 * The board header's Invite: a small panel under the button with the link
 * that opens the join flow and the code people read out, each a press from
 * the clipboard. The People panel's footer copies the same two things.
 */
export function InviteButton({ code }: { code: string }) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [anchor, setAnchor] = useState<DOMRect | null>(null);
  const close = useCallback(() => setAnchor(null), []);

  return (
    <>
      <Tooltip label="Invite people" placement="bottom">
        <button
          ref={triggerRef}
          type="button"
          onClick={() =>
            setAnchor((open) =>
              open ? null : (triggerRef.current?.getBoundingClientRect() ?? null),
            )
          }
          aria-label="Invite people"
          aria-haspopup="dialog"
          aria-expanded={anchor !== null}
          className={TRIGGER}
        >
          <UserPlus aria-hidden="true" size={16} strokeWidth={1.8} />
        </button>
      </Tooltip>
      {anchor ? (
        <AnchoredPopover
          anchor={anchor}
          width={PANEL_WIDTH}
          maxHeight={PANEL_MAX_HEIGHT}
          label="Invite people"
          onClose={close}
          ignore={triggerRef}
        >
          <InvitePanel code={code} />
        </AnchoredPopover>
      ) : null}
    </>
  );
}
