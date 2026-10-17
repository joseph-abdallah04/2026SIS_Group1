import { MessageSquare, Sparkles, Users, type LucideIcon } from 'lucide-react';

import { Tooltip } from '../../components/ui/Tooltip';
import type { SidePanelTab } from './useSidePanel';

/** What the AI button has to say while its panel is not on screen. */
export interface AssistantMarks {
  /** An answer finished while the panel was away. */
  unread: boolean;
  /** No AI provider is set up, so the first send would fail. */
  unconfigured: boolean;
  /** A reply is still streaming in. */
  busy: boolean;
}

interface SidePanelStripProps {
  active: SidePanelTab | null;
  onSelect: (tab: SidePanelTab) => void;
  assistant: AssistantMarks;
  /** The open panel's body, which the pressed button controls. */
  panelId: string;
  /** Each button, so focus can come back to the one whose panel just closed. */
  buttonRef: (tab: SidePanelTab, node: HTMLButtonElement | null) => void;
}

export const SIDE_PANEL_TABS: readonly { tab: SidePanelTab; label: string; Icon: LucideIcon }[] = [
  { tab: 'people', label: 'People', Icon: Users },
  { tab: 'chat', label: 'Chat', Icon: MessageSquare },
  { tab: 'assistant', label: 'Assistant', Icon: Sparkles },
];

const BUTTON =
  'relative flex size-8 items-center justify-center rounded-[9px] transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rt-secondary';

/**
 * The words a sighted person gets from the AI button's mark. Unread beats the
 * setup warning, and both beat "replying": if an answer is waiting, that is the
 * news.
 */
function assistantNote({ unread, unconfigured, busy }: AssistantMarks): string | null {
  if (unread) return 'new answer';
  if (unconfigured) return 'no AI provider set up';
  return busy ? 'replying' : null;
}

function AssistantMark({ unread, unconfigured, busy }: AssistantMarks) {
  if (unread) {
    return (
      <span
        aria-hidden="true"
        data-strip-mark="unread"
        className="absolute top-1 right-1 size-1.5 rounded-full bg-rt-secondary ring-2 ring-rt-surface-alt"
      />
    );
  }
  if (unconfigured) {
    return (
      <span
        aria-hidden="true"
        data-strip-mark="unconfigured"
        className="absolute top-0.5 right-1 text-[11px] leading-none font-bold text-rt-secondary-deep"
      >
        !
      </span>
    );
  }
  if (busy) {
    return (
      <span
        aria-hidden="true"
        data-strip-mark="busy"
        className="absolute top-1 right-1 size-1.5 animate-pulse rounded-full bg-rt-cool ring-2 ring-rt-surface-alt"
      />
    );
  }
  return null;
}

/**
 * The side panel's activity bar: People, Chat and the assistant, top to
 * bottom, on the screen's right edge.
 *
 * Toggle buttons rather than tabs, because pressing the one on show closes
 * the panel: `aria-pressed` says which is open, and only that one controls
 * the panel body. The pressed button carries an amber bar on its board side,
 * pointing at the panel it opened.
 */
export function SidePanelStrip({
  active,
  onSelect,
  assistant,
  panelId,
  buttonRef,
}: SidePanelStripProps) {
  return (
    <div role="group" aria-label="Side panel" className="flex flex-col items-center gap-1">
      {SIDE_PANEL_TABS.map(({ tab, label, Icon }) => {
        const pressed = active === tab;
        // The marks only matter while the assistant's panel is away; open, the
        // panel says the same things in full.
        const note = tab === 'assistant' && !pressed ? assistantNote(assistant) : null;
        return (
          <Tooltip key={tab} label={label} placement="left">
            <button
              ref={(node) => buttonRef(tab, node)}
              type="button"
              onClick={() => onSelect(tab)}
              aria-pressed={pressed}
              aria-controls={pressed ? panelId : undefined}
              aria-label={note ? `${label}, ${note}` : label}
              data-side-tab={tab}
              className={`${BUTTON} ${
                pressed
                  ? 'bg-rt-secondary/[0.18] text-rt-ink'
                  : 'text-rt-ink-muted hover:bg-rt-ink/[0.06] hover:text-rt-ink'
              }`}
            >
              {pressed ? (
                <span
                  aria-hidden="true"
                  className="absolute inset-y-[7px] -left-1.5 w-[2.5px] rounded-full bg-rt-secondary"
                />
              ) : null}
              <Icon aria-hidden="true" size={18} strokeWidth={1.8} />
              {tab === 'assistant' && !pressed ? <AssistantMark {...assistant} /> : null}
            </button>
          </Tooltip>
        );
      })}
    </div>
  );
}
