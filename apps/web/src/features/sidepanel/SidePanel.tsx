// The board's right-hand side panel: People, Chat and the AI assistant behind
// one icon strip, in the same chrome as the agenda on the left.
//
// Mounted by `SessionPinboard` inside `CreativeToolsProvider`, so the
// assistant's Propose (F37) can use the same submit path as the sticky and
// drawing editors. It stays mounted while it is closed: the assistant's
// conversation lives here (F34), and so does the resize drag that can close
// and reopen it in one gesture. The strip, the rail and the People and Chat
// tabs are `SidePanelFrame`'s, which the waiting room uses without this.
import { useContext, useEffect, type ReactNode } from 'react';
import type { ArtifactJson, AssistantContext, QuestionStatus } from '@roundtable/shared';

import { AssistantPanel } from '../assistant/AssistantPanel';
import { useAssistantDock } from '../assistant/useAssistantDock';
import { CreativeToolsContext } from '../tools/CreativeToolsContext';
import { SidePanelFrame } from './SidePanelFrame';
import type { SidePanelControl } from './useSidePanel';

export interface SidePanelProps {
  /** Which feature is showing. Held by the page, so the header can open People. */
  control: SidePanelControl;
  /** A ballot is up: the panel stays shut and its strip inert (see `SidePanelFrame`). */
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
  const { tab, close } = control;
  const creativeTools = useContext(CreativeToolsContext);
  const dock = useAssistantDock({
    sessionId,
    getContext,
    boardItems,
    showing: !suppressed && tab === 'assistant',
  });

  // The studio is a page-modal. A panel left open underneath is out of the way,
  // but closing it keeps the board clear when the editor closes. Watching `tab`
  // too, for an open that lands while the studio is up (see `SidePanelFrame`).
  useEffect(() => {
    if (creativeTools?.activeTool && tab !== null) close();
  }, [close, creativeTools?.activeTool, tab]);

  return (
    <SidePanelFrame
      control={control}
      suppressed={suppressed}
      people={people}
      peopleCount={peopleCount}
      peopleAction={peopleAction}
      assistant={{
        marks: {
          unread: dock.unread,
          unconfigured: dock.configured === false,
          busy: dock.busy,
        },
        body: (
          <AssistantPanel
            chat={dock.chat}
            configured={dock.configured}
            {...(dock.modelLabel ? { modelLabel: dock.modelLabel } : {})}
            {...(questionStatus !== undefined ? { questionStatus } : {})}
            onProviderConfigured={dock.onProviderConfigured}
          />
        ),
      }}
    />
  );
}
