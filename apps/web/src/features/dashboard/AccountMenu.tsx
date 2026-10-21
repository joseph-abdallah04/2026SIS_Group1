import { useEffect, useId, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown, LogOut, Settings } from 'lucide-react';
import type { User } from '@roundtable/shared';

import { initialsFromName, swatchForId } from '../sessions/waitingRoomSeats';

const MENU_ITEM =
  'flex items-center gap-2.5 px-3.5 py-2 text-[13px] font-medium text-rt-ink hover:bg-rt-primary-tint';

/**
 * The signed-in person's avatar, opening Settings and Log out. One control in
 * the header rather than two links beside a picture that did nothing.
 *
 * Until the profile has loaded it is a plain circle, so the header does not
 * shift when the initials arrive.
 */
export function AccountMenu({ user, onLogout }: { user: User | null; onLogout: () => void }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const swatch = user ? swatchForId(user.id) : null;

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative ml-auto">
      <button
        type="button"
        aria-label="Account"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((value) => !value)}
        className="flex cursor-pointer items-center gap-1 rounded-full p-0.5 pr-1.5 transition-colors hover:bg-rt-ink/5 focus-visible:ring-2 focus-visible:ring-rt-secondary focus-visible:outline-none"
      >
        <span
          aria-hidden
          className="flex size-8 items-center justify-center rounded-full text-[11px] font-semibold"
          style={swatch ? { background: swatch.background, color: swatch.color } : undefined}
        >
          {user ? initialsFromName(user.displayName) : null}
        </span>
        <ChevronDown aria-hidden size={14} className="hidden text-rt-ink-muted sm:block" />
      </button>

      {open ? (
        <div
          id={menuId}
          role="menu"
          aria-label="Account"
          className="absolute top-full right-0 z-30 mt-2 w-56 overflow-hidden rounded-2xl border border-rt-tertiary bg-white py-1.5 shadow-lg"
        >
          {user ? (
            <div className="border-b border-rt-tertiary/70 px-3.5 pt-1.5 pb-2.5">
              <p className="truncate text-[13px] font-semibold text-rt-ink">{user.displayName}</p>
              <p className="truncate text-[12px] text-rt-ink-muted">{user.email}</p>
            </div>
          ) : null}
          {/* Named for the page it opens: Settings, with the profile and the
              AI assistant as its tabs. */}
          <Link
            role="menuitem"
            to="/settings"
            onClick={() => setOpen(false)}
            className={`mt-1 ${MENU_ITEM}`}
          >
            <Settings aria-hidden size={15} className="text-rt-ink-muted" />
            Settings
          </Link>
          <div role="separator" className="my-1 border-t border-rt-tertiary/70" />
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              onLogout();
            }}
            className={`w-full cursor-pointer text-left ${MENU_ITEM}`}
          >
            <LogOut aria-hidden size={15} className="text-rt-ink-muted" />
            Log out
          </button>
        </div>
      ) : null}
    </div>
  );
}
