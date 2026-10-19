// The side panel's frame: the icon strip, the rail it opens, People and Chat.
// The board's `SidePanel` wraps it with the AI assistant; the waiting room uses
// it as it is, since there is no board yet for an assistant to read.
import { useCallback, useEffect, useId, useRef, type ReactNode } from 'react';

import { BoardRail } from '../../components/BoardRail';
import { ChatPlaceholder } from './ChatPlaceholder';
import { SidePanelStrip, type AssistantMarks } from './SidePanelStrip';
import type { SidePanelControl, SidePanelTab } from './useSidePanel';

/**
 * Its own remembered width, not the agenda's: the two hold different things.
 * It opens at the width the assistant had before it could be dragged, which a
 * conversation needs. One key for the lobby and the board, so the panel keeps
 * its width when the session starts.
 */
const SIDE_PANEL_RESIZE = {
  storageKey: 'side-panel',
  label: 'Resize side panel',
  defaultWidth: 384,
};

/** The assistant's tab, from whoever owns its conversation. */
export interface SidePanelAssistant {
  /** What its strip button says while its panel is away. */
  marks: AssistantMarks;
  /** The panel itself, shown while its tab is. */
  body: ReactNode;
}

export interface SidePanelFrameProps {
  /** Which feature is showing. Held by the page, so the header can open People. */
  control: SidePanelControl;
  /**
   * A ballot covers the board and both rails. The strip stays in the row, so the
   * board does not change width under the overlay, and is marked inert so it is
   * not something else to tab into while people are voting.
   */
  suppressed?: boolean;
  /** The People tab's body, and the count its title shows. */
  people: ReactNode;
  peopleCount: number;
  /** Beside the collapse arrow while People shows: the leader's "Mute all". */
  peopleAction?: ReactNode;
  /** The third tab. Without it the strip is People and Chat only. */
  assistant?: SidePanelAssistant;
}

export function SidePanelFrame({
  control,
  suppressed = false,
  people,
  peopleCount,
  peopleAction,
  assistant,
}: SidePanelFrameProps) {
  const { tab, toggle, close, toggleOpen } = control;
  const tabs: readonly SidePanelTab[] = assistant
    ? ['people', 'chat', 'assistant']
    : ['people', 'chat'];
  // A tab this panel does not have reads as closed, rather than as a title
  // over an empty body.
  const shown = suppressed || tab === null || !tabs.includes(tab) ? null : tab;
  const panelId = useId();

  // Watching `tab` too: something outside the panel can open it (the header's
  // people snapshot sits above the ballot, which only covers the board row),
  // and an open that lands while it is meant to be shut would otherwise wait
  // hidden and pop the panel open the moment the vote ends.
  useEffect(() => {
    if (suppressed && tab !== null) close();
  }, [close, suppressed, tab]);

  // Escape does not close this panel. It belongs to whatever is in hand: a
  // dialog, the studio, a half-typed message. The agenda rail does not close
  // on Escape either. The assistant's provider-setup dialog still does — that
  // listener lives on its panel.

  const buttons = useRef(new Map<SidePanelTab, HTMLButtonElement>());
  const setButton = useCallback((which: SidePanelTab, node: HTMLButtonElement | null) => {
    if (node) buttons.current.set(which, node);
    else buttons.current.delete(which);
  }, []);

  // Closing destroys whatever had focus inside the panel, which drops it to
  // <body>. Hand it to the strip button that opened the panel. Only then:
  // focus somewhere else on purpose (the studio opening, a click on the
  // board) is left where it is.
  const lastShown = useRef<SidePanelTab | null>(null);
  useEffect(() => {
    const previous = lastShown.current;
    lastShown.current = shown;
    if (previous === null || shown !== null) return;
    const focused = document.activeElement;
    if (focused === null || focused === document.body) buttons.current.get(previous)?.focus();
  }, [shown]);

  const panelTitle =
    shown === 'people' ? (
      <>
        People
        <span className="ml-1.5 tracking-[0.04em] text-rt-ink-muted tabular-nums">
          {peopleCount}
        </span>
      </>
    ) : shown === 'chat' ? (
      'Chat'
    ) : (
      'Assistant'
    );

  return (
    <BoardRail
      side="right"
      title="Side panel"
      panelTitle={panelTitle}
      collapsed={shown === null}
      inert={suppressed}
      onToggle={() => {
        if (!suppressed) toggleOpen();
      }}
      expandLabel="Open side panel"
      collapseLabel="Collapse side panel"
      headerAction={shown === 'people' ? peopleAction : undefined}
      resize={SIDE_PANEL_RESIZE}
      strip={
        <SidePanelStrip
          tabs={tabs}
          active={shown}
          onSelect={(which) => {
            if (!suppressed) toggle(which);
          }}
          {...(assistant ? { assistant: assistant.marks } : {})}
          panelId={panelId}
          buttonRef={setButton}
        />
      }
    >
      <div id={panelId} className="flex min-h-0 flex-1 flex-col">
        {shown === 'people' ? (
          people
        ) : shown === 'chat' ? (
          <ChatPlaceholder />
        ) : shown === 'assistant' ? (
          assistant?.body
        ) : null}
      </div>
    </BoardRail>
  );
}
