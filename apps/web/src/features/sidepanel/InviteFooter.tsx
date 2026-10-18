import { useRef } from 'react';
import { Copy, Link } from 'lucide-react';

import { joinLink } from '../sessions/joinLink';
import { useInviteCopy } from '../sessions/useInviteCopy';

const FIELD =
  'min-w-0 flex-1 rounded-lg border border-rt-tertiary/70 bg-white px-2 py-1.5 font-mono text-[13px] tracking-[0.06em] text-rt-ink outline-none focus-visible:ring-2 focus-visible:ring-rt-secondary';
const BUTTON =
  'inline-flex h-[30px] shrink-0 items-center gap-1.5 rounded-full border border-rt-tertiary bg-white px-2.5 text-[11.5px] font-semibold whitespace-nowrap text-rt-ink transition-colors hover:bg-rt-ink/[0.04] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rt-secondary';

/**
 * The bottom of the People panel: the session's join code, and buttons that
 * copy it or the link that opens the join flow with it filled in.
 *
 * The link is not shown, only copied: it is long, and the code beside it is
 * what people read out. If copying fails, the link appears in a field of its
 * own so it can be selected by hand.
 */
export function InviteFooter({ code }: { code: string }) {
  const codeRef = useRef<HTMLInputElement>(null);
  const { copied, failed, copy } = useInviteCopy<'code' | 'link'>();
  const link = joinLink(code);

  return (
    <div className="-mx-3 shrink-0 border-t border-rt-tertiary px-3 pt-2.5 pb-3">
      <p className="mb-2 text-[10px] font-semibold tracking-[0.16em] text-rt-ink-faint uppercase">
        Invite
      </p>
      <div className="flex items-center gap-1.5">
        <input
          ref={codeRef}
          readOnly
          value={code}
          aria-label="Join code"
          onFocus={(event) => event.currentTarget.select()}
          className={FIELD}
        />
        <button
          type="button"
          onClick={() => void copy('code', code, codeRef.current)}
          aria-label="Copy join code"
          className={BUTTON}
        >
          <Copy aria-hidden="true" size={12} strokeWidth={2} />
          {copied === 'code' ? 'Copied' : 'Code'}
        </button>
        <button
          type="button"
          onClick={() => void copy('link', link)}
          aria-label="Copy invite link"
          className={BUTTON}
        >
          <Link aria-hidden="true" size={12} strokeWidth={2} />
          {copied === 'link' ? 'Copied' : 'Link'}
        </button>
      </div>
      {failed === 'link' ? (
        <input
          readOnly
          value={link}
          aria-label="Invite link"
          onFocus={(event) => event.currentTarget.select()}
          className={`${FIELD} mt-2 w-full text-[12px] tracking-normal`}
        />
      ) : null}
      {/* Spoken as well as shown: the buttons keep their names, so this is
          the only place the result is said. */}
      <p role="status" className={failed ? 'mt-1.5 text-[11px] text-rt-ink-muted' : 'sr-only'}>
        {failed
          ? `Could not copy automatically. Select the ${failed} and copy it yourself.`
          : copied
            ? 'Copied'
            : ''}
      </p>
    </div>
  );
}
