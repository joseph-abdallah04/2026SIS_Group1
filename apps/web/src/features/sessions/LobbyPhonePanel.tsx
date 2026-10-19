import type { ReactNode } from 'react';
import { ChevronDown, MessageSquare, Users, type LucideIcon } from 'lucide-react';

import { ChatPlaceholder } from '../sidepanel/ChatPlaceholder';
import type { SidePanelControl, SidePanelTab } from '../sidepanel';

const TABS: readonly { tab: SidePanelTab; label: string; Icon: LucideIcon }[] = [
  { tab: 'people', label: 'People', Icon: Users },
  { tab: 'chat', label: 'Chat', Icon: MessageSquare },
];

const SHEET_ID = 'lobby-phone-sheet';

/** The phone's own People / Chat, open while one of the two is. */
function shownTab(control: SidePanelControl): 'people' | 'chat' | null {
  return control.tab === 'people' || control.tab === 'chat' ? control.tab : null;
}

/**
 * On a phone, the side panel's People and Chat rise as a sheet over the lower
 * part of the page rather than taking a column the screen does not have.
 * Placed inside the content row, which it covers from the bottom; a tap on the
 * dimmed part above puts it away. Driven by the same state as the panel, so
 * what is open here is open on the board after Start.
 */
export function LobbyPhoneSheet({
  control,
  people,
  peopleCount,
  peopleAction,
}: {
  control: SidePanelControl;
  people: ReactNode;
  peopleCount: number;
  peopleAction?: ReactNode;
}) {
  const shown = shownTab(control);
  if (!shown) return null;

  return (
    <>
      <button
        type="button"
        aria-label="Close"
        tabIndex={-1}
        onClick={control.close}
        className="absolute inset-0 z-20 bg-rt-ink/15"
      />
      <section
        id={SHEET_ID}
        aria-label={shown === 'people' ? 'People' : 'Chat'}
        className="absolute inset-x-0 bottom-0 z-30 flex h-[70%] flex-col rounded-t-[18px] border-t border-rt-tertiary bg-rt-surface-alt px-3 shadow-[0_-12px_30px_rgba(8,12,21,0.14)]"
      >
        <div className="-mx-3 flex min-h-11 shrink-0 items-center justify-between gap-2 border-b border-rt-tertiary px-3 py-2">
          <p className="text-[10px] font-semibold tracking-[0.16em] text-rt-ink-faint uppercase">
            {shown === 'people' ? (
              <>
                People
                <span className="ml-1.5 tracking-[0.04em] text-rt-ink-muted tabular-nums">
                  {peopleCount}
                </span>
              </>
            ) : (
              'Chat'
            )}
          </p>
          <div className="flex items-center gap-1.5">
            {shown === 'people' ? peopleAction : null}
            <button
              type="button"
              onClick={control.close}
              aria-label={`Close ${shown === 'people' ? 'People' : 'Chat'}`}
              className="flex size-8 items-center justify-center rounded-full text-rt-ink-muted transition-colors hover:bg-rt-ink/6 hover:text-rt-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rt-secondary"
            >
              <ChevronDown aria-hidden="true" size={18} strokeWidth={1.8} />
            </button>
          </div>
        </div>
        <div className="flex min-h-0 flex-1 flex-col">
          {shown === 'people' ? people : <ChatPlaceholder />}
        </div>
      </section>
    </>
  );
}

/** The phone's strip: People and Chat along the bottom edge. */
export function LobbyPhoneBar({ control }: { control: SidePanelControl }) {
  const shown = shownTab(control);
  return (
    <div
      role="group"
      aria-label="Side panel"
      className="flex h-13 shrink-0 items-center justify-center gap-7 border-t border-rt-tertiary bg-rt-surface-alt"
    >
      {TABS.map(({ tab, label, Icon }) => {
        const pressed = shown === tab;
        return (
          <button
            key={tab}
            type="button"
            onClick={() => control.toggle(tab)}
            aria-pressed={pressed}
            aria-controls={pressed ? SHEET_ID : undefined}
            data-side-tab={tab}
            className={`relative flex h-10 items-center gap-2 rounded-[10px] px-3 text-[12.5px] font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rt-secondary ${
              pressed
                ? 'bg-rt-secondary/18 text-rt-ink'
                : 'text-rt-ink-muted hover:bg-rt-ink/6 hover:text-rt-ink'
            }`}
          >
            <Icon aria-hidden="true" size={18} strokeWidth={1.8} />
            {label}
          </button>
        );
      })}
    </div>
  );
}
