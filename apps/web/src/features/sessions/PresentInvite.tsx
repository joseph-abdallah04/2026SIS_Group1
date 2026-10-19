import { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

import { CodeTiles } from './CodeTiles';

interface PresentInviteProps {
  code: string;
  /** The link as people would type it: no scheme, so it fits on one line. */
  link: string;
  title: string;
  onClose: () => void;
}

/**
 * The invite, full-screen: the code and the link big enough to read off a
 * projector in a meeting room. Escape, the close button or a click anywhere
 * puts it away.
 *
 * Portalled to the body: the lobby's layout is a size container, which makes
 * it the containing block for anything `fixed` inside it, and this has to
 * cover the whole screen, header included.
 */
export function PresentInvite({ code, link, title, onClose }: PresentInviteProps) {
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  // Read through a ref so the effect below runs once: the lobby re-renders
  // with every arrival, and re-running it would bounce focus about.
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    const previous = document.activeElement;
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onCloseRef.current();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      // Back to the Present button, so a keyboard user carries on from there.
      if (previous instanceof HTMLElement) previous.focus();
    };
  }, []);

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onClick={onClose}
      className="fixed inset-0 z-60 flex cursor-pointer flex-col items-center justify-center gap-6 bg-rt-secondary-wash/97 p-6 text-center"
    >
      <button
        ref={closeRef}
        type="button"
        onClick={onClose}
        aria-label="Close"
        className="absolute top-4 right-4 flex size-10 items-center justify-center rounded-full text-rt-ink-muted transition-colors hover:bg-rt-ink/6 hover:text-rt-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rt-secondary"
      >
        <X aria-hidden="true" size={20} strokeWidth={1.8} />
      </button>
      <p id={titleId} className="text-[clamp(15px,1.6vw,21px)] text-rt-ink-muted">
        Join <span className="font-semibold text-rt-ink">{title}</span>
      </p>
      <CodeTiles code={code} size="present" />
      <p className="text-[clamp(15px,2vw,26px)] font-semibold text-rt-secondary-deep">{link}</p>
      <p className="text-[12px] text-rt-ink-faint">Click anywhere or press Esc to close</p>
    </div>,
    document.body,
  );
}
