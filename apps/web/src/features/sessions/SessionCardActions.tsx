import { useEffect, useId, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { MoreHorizontal } from 'lucide-react';
import type { SessionStatus } from '@roundtable/shared';

import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { useDeleteSession } from './useDeleteSession';

interface SessionCardActionsProps {
  sessionId: string;
  title: string;
  status: SessionStatus;
  onDeleted: () => void;
}

/**
 * Hover ⋯ on a dashboard thumbnail. Edit stays draft-only (F05). Delete on a
 * draft destroys it; delete on an ended session only hides it for this user.
 */
export function SessionCardActions({
  sessionId,
  title,
  status,
  onDeleted,
}: SessionCardActionsProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const { remove, deleting, error } = useDeleteSession();
  const rootRef = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const isDraft = status === 'draft';

  useEffect(() => {
    if (!menuOpen) return;

    function onPointerDown(event: PointerEvent) {
      if (rootRef.current?.contains(event.target as Node)) return;
      setMenuOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setMenuOpen(false);
    }

    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [menuOpen]);

  async function handleDelete() {
    if (await remove(sessionId)) onDeleted();
  }

  return (
    <>
      <div
        ref={rootRef}
        className={`absolute top-2 right-2 z-10 ${
          menuOpen
            ? 'opacity-100'
            : 'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 [@media(hover:none)]:opacity-100'
        }`}
      >
        <button
          type="button"
          aria-label={`Actions for ${title}`}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          aria-controls={menuId}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            setMenuOpen((open) => !open);
          }}
          className="flex h-8 w-8 items-center justify-center rounded-lg bg-white text-rt-ink shadow-sm ring-1 ring-black/10 hover:bg-rt-surface-alt focus-visible:ring-2 focus-visible:ring-rt-ink focus-visible:outline-none"
        >
          <MoreHorizontal size={16} aria-hidden />
        </button>

        {menuOpen && (
          <div
            id={menuId}
            role="menu"
            aria-label={`Actions for ${title}`}
            className="absolute top-full right-0 mt-1 min-w-[8.5rem] rounded-lg border border-rt-tertiary bg-white py-1 shadow-lg"
          >
            {isDraft && (
              <Link
                role="menuitem"
                to={`/sessions/${sessionId}/edit`}
                className="block px-3 py-1.5 text-[13px] font-semibold text-rt-ink hover:bg-rt-primary-tint"
                onClick={() => setMenuOpen(false)}
              >
                Edit
              </Link>
            )}
            <button
              type="button"
              role="menuitem"
              className="block w-full px-3 py-1.5 text-left text-[13px] font-semibold text-red-600 hover:bg-red-50"
              onClick={() => {
                setMenuOpen(false);
                setConfirming(true);
              }}
            >
              Delete
            </button>
          </div>
        )}
      </div>

      {confirming && (
        <ConfirmDialog
          title={isDraft ? 'Delete this draft?' : 'Delete this session from your dashboard?'}
          confirmLabel="Delete"
          confirmingLabel="Deleting…"
          busy={deleting}
          onConfirm={() => void handleDelete()}
          onCancel={() => setConfirming(false)}
        >
          This cannot be undone.
          {error ? <p className="mt-2 text-red-600">{error}</p> : null}
        </ConfirmDialog>
      )}
    </>
  );
}
