// The board's right-hand side panel: People, Chat and the AI assistant behind
// one icon strip, in the same chrome as the agenda on the left.
//
// Mounted by `SessionPinboard` inside `CreativeToolsProvider`, so the
// assistant's Propose (F37) can use the same submit path as the sticky and
// drawing editors. It stays mounted while it is closed: the assistant's
// conversation lives here (F34), and so does the resize drag that can close
// and reopen it in one gesture.
import { useCallback, useContext, useEffect, useId, useRef, type ReactNode } from 'react';
import type { ArtifactJson, AssistantContext, QuestionStatus } from '@roundtable/shared';

import { BoardRail } from '../../components/BoardRail';
import { AssistantPanel } from '../assistant/AssistantPanel';
import { useAssistantDock } from '../assistant/useAssistantDock';
import { CreativeToolsContext } from '../tools/CreativeToolsContext';
import { ChatPlaceholder } from './ChatPlaceholder';
import { SidePanelStrip } from './SidePanelStrip';
import type { SidePanelControl, SidePanelTab } from './useSidePanel';

/**
 * Its own remembered width, not the agenda's: the two hold different things.
 * It opens at the width the assistant had before it could be dragged, which a
 * conversation needs.
 */
const SIDE_PANEL_RESIZE = {
  storageKey: 'side-panel',
  label: 'Resize side panel',
  defaultWidth: 384,
};

export interface SidePanelProps {
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
  sessionId: string;
  /**
   * Called on every send so the agent sees the board as it is at that moment — active
   * question, recent proposals, who wrote them.
   */
  getContext?: () => AssistantContext;
  /** Live board items, so a Propose that has landed can unlock after a delete. */
  boardItems?: readonly { artifactJson: ArtifactJson }[];
  /** The pinboard's current phase, so a locked Propose can say why it is locked. */
  questionStatus?: QuestionStatus | null;
}

export function SidePanel({
  control,
  suppressed = false,
  people,
  peopleCount,
  peopleAction,
  sessionId,
  getContext,
  boardItems,
  questionStatus,
}: SidePanelProps) {
  const { tab, toggle, close, toggleOpen } = control;
  const shown = suppressed ? null : tab;
  const panelId = useId();
  const creativeTools = useContext(CreativeToolsContext);
  const dock = useAssistantDock({
    sessionId,
    getContext,
    boardItems,
    showing: shown === 'assistant',
  });

  // The studio is a page-modal. A panel left open underneath is out of the way,
  // but closing it keeps the board clear when the editor closes.
  // Watching `tab` too: something outside the panel can open it (the header's
  // people snapshot sits above the ballot, which only covers the board row),
  // and an open that lands while it is meant to be shut would otherwise wait
  // hidden and pop the panel open the moment the vote or the editor ends.
  useEffect(() => {
    if (creativeTools?.activeTool && tab !== null) close();
  }, [close, creativeTools?.activeTool, tab]);

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
          active={shown}
          onSelect={(which) => {
            if (!suppressed) toggle(which);
          }}
          assistant={{
            unread: dock.unread,
            unconfigured: dock.configured === false,
            busy: dock.busy,
          }}
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
          <AssistantPanel
            chat={dock.chat}
            configured={dock.configured}
            {...(dock.modelLabel ? { modelLabel: dock.modelLabel } : {})}
            {...(questionStatus !== undefined ? { questionStatus } : {})}
            onProviderConfigured={dock.onProviderConfigured}
          />
        ) : null}
      </div>
    </BoardRail>
  );
}
