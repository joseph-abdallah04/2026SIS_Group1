import { MessageSquare } from 'lucide-react';

/**
 * Where the room's chat will go. Not built yet: this holds its place in the
 * side panel so the strip's order is settled before the feature is.
 *
 * The composer is drawn, disabled, so the space reads as a chat rather than
 * an empty box. Its label says it is not working yet.
 */
export function ChatPlaceholder() {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
        <span className="mb-3 flex size-11 items-center justify-center rounded-full border border-rt-tertiary/70 bg-white text-rt-ink-faint">
          <MessageSquare aria-hidden="true" size={20} strokeWidth={1.8} />
        </span>
        <p className="text-[13.5px] font-semibold text-rt-ink">Chat is coming soon</p>
        <p className="mt-1.5 max-w-60 text-[12px] leading-relaxed text-rt-ink-muted">
          A room-wide chat for quick notes and links will live here.
        </p>
      </div>
      <div className="-mx-3 flex items-end gap-1.5 border-t border-rt-tertiary/60 p-3">
        <textarea
          disabled
          rows={1}
          aria-label="Message everyone (coming soon)"
          placeholder="Message everyone…"
          className="h-10 min-w-0 flex-1 resize-none rounded-[18px] border border-rt-tertiary/70 bg-white px-3.5 py-2.5 text-[13px] text-rt-ink disabled:opacity-60"
        />
        <button
          type="button"
          disabled
          className="h-[38px] shrink-0 rounded-full bg-rt-primary px-4 text-[13px] font-semibold text-rt-ink disabled:opacity-45"
        >
          Send
        </button>
      </div>
    </div>
  );
}
