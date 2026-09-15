import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import {
  CreativeToolsContext,
  type CreativeToolsContextValue,
} from '../tools/CreativeToolsContext';
import type { AssistantChat, ChatEntry, ProposeState } from './useAssistantChat';

vi.mock('../settings/LlmSettingsForm', () => ({
  LlmSettingsForm: ({
    onSaved,
    onCancel,
  }: {
    onSaved?: (config: { model: string }) => void;
    onCancel?: () => void;
  }) => (
    <div>
      <h3 id="assistant-provider-setup-title">Set up your provider</h3>
      <button type="button" onClick={() => onSaved?.({ model: 'gpt-4o-mini' })}>
        Save
      </button>
      <button type="button" onClick={() => onCancel?.()}>
        Cancel
      </button>
    </div>
  ),
}));

const { AssistantPanel, transcriptFollowKey } = await import('./AssistantPanel');

const sticky = (
  id: string,
  propose: ProposeState,
  extra: Partial<Extract<ChatEntry, { kind: 'artifact' }>> = {},
): ChatEntry => ({
  kind: 'artifact',
  id,
  source: 'sticky_ideation',
  artifact: { type: 'sticky', text: `Note ${id}`, color: 'yellow' },
  propose,
  ...extra,
});

const userMsg = (text: string): ChatEntry => ({ kind: 'user', id: `u-${text}`, text });
const reply = (text: string): ChatEntry => ({
  kind: 'assistant',
  id: `a-${text}`,
  text,
  streaming: false,
});

function tools(
  proposeArtifact: CreativeToolsContextValue['proposeArtifact'],
  isLive = true,
): CreativeToolsContextValue {
  return {
    activeTool: null,
    draftScope: { sessionId: 's1', questionId: 'q1', viewerId: 'u1' },
    extensionSource: null,
    isReusingOwn: false,
    editSource: null,
    isLive,
    stickyDraftKey: null,
    submissionStatus: 'idle',
    submissionError: null,
    openTool: () => undefined,
    openEditorForExtend: () => undefined,
    openEditorForEdit: () => undefined,
    closeTool: () => true,
    setCloseGuard: () => undefined,
    resetSubmission: () => undefined,
    submitArtifact: async () => false,
    proposeArtifact,
  };
}

function chat(entries: ChatEntry[], extra: Partial<AssistantChat> = {}): AssistantChat {
  return {
    entries,
    streaming: false,
    thinking: false,
    send: vi.fn(),
    stop: vi.fn(),
    clear: vi.fn(),
    setProposeState: vi.fn(),
    syncProposedWithBoard: vi.fn(),
    ...extra,
  };
}

function renderPanel(
  next: AssistantChat,
  proposeArtifact = vi.fn(async () => ({ ok: true as const })),
) {
  return render(
    <CreativeToolsContext.Provider value={tools(proposeArtifact)}>
      <AssistantPanel chat={next} onClose={() => undefined} configured />
    </CreativeToolsContext.Provider>,
  );
}

describe('transcriptFollowKey', () => {
  it('does not change when a card is proposed, fails, or is seen on the board', () => {
    const idle = [userMsg('ideas'), sticky('n1', 'idle')];
    const proposed = [userMsg('ideas'), sticky('n1', 'proposed', { seenOnBoard: true })];
    const failed = [userMsg('ideas'), sticky('n1', 'failed', { proposeError: 'offline' })];

    expect(transcriptFollowKey(idle, false, false)).toBe(
      transcriptFollowKey(proposed, false, false),
    );
    expect(transcriptFollowKey(idle, false, false)).toBe(transcriptFollowKey(failed, false, false));
  });

  it('does change when the conversation grows', () => {
    const before = [userMsg('ideas'), sticky('n1', 'idle')];
    const after = [...before, reply('Here are five.')];
    expect(transcriptFollowKey(before, false, false)).not.toBe(
      transcriptFollowKey(after, false, false),
    );
  });
});

describe('assistant feed scroll', () => {
  function feed(): HTMLDivElement {
    const node = document.querySelector('.rt-assistant-feed');
    if (!(node instanceof HTMLDivElement)) throw new Error('feed missing');
    return node;
  }

  function stubHeight(node: HTMLDivElement, height: number) {
    Object.defineProperty(node, 'scrollHeight', { configurable: true, get: () => height });
  }

  it('leaves the feed where it was when a card is proposed', () => {
    const start = [userMsg('ideas'), sticky('n1', 'idle'), sticky('n2', 'idle'), reply('Here.')];
    const { rerender } = renderPanel(chat(start));

    const node = feed();
    stubHeight(node, 2000);
    node.scrollTop = 480;

    rerender(
      <CreativeToolsContext.Provider value={tools(async () => ({ ok: true }))}>
        <AssistantPanel
          chat={chat([
            userMsg('ideas'),
            sticky('n1', 'proposed'),
            sticky('n2', 'idle'),
            reply('Here.'),
          ])}
          onClose={() => undefined}
          configured
        />
      </CreativeToolsContext.Provider>,
    );

    expect(node.scrollTop).toBe(480);
  });

  it('still follows the tail when a new reply arrives', () => {
    const start = [userMsg('ideas'), sticky('n1', 'idle')];
    const { rerender } = renderPanel(chat(start));

    const node = feed();
    stubHeight(node, 2000);
    node.scrollTop = 480;

    rerender(
      <CreativeToolsContext.Provider value={tools(async () => ({ ok: true }))}>
        <AssistantPanel
          chat={chat([...start, reply('Here are five.')])}
          onClose={() => undefined}
          configured
        />
      </CreativeToolsContext.Provider>,
    );

    expect(node.scrollTop).toBe(2000);
  });
});

describe('propose availability copy', () => {
  it('says the pinboard is locked when the question has gone to voting', () => {
    render(
      <CreativeToolsContext.Provider value={tools(async () => ({ ok: true }), false)}>
        <AssistantPanel
          chat={chat([sticky('n1', 'idle')])}
          onClose={() => undefined}
          configured
          questionStatus="voting"
        />
      </CreativeToolsContext.Provider>,
    );

    expect(screen.getByText('Proposals are locked while this question is in voting')).toBeTruthy();
    expect(screen.queryByText('Available once the board is connected')).toBeNull();
  });
});

describe('provider setup', () => {
  it('does not send the user to /settings, and opens setup inside the rail', async () => {
    const user = userEvent.setup();
    render(
      <CreativeToolsContext.Provider value={tools(async () => ({ ok: true }))}>
        <AssistantPanel chat={chat([])} onClose={() => undefined} configured={false} />
      </CreativeToolsContext.Provider>,
    );

    expect(screen.queryByRole('link', { name: /settings/i })).toBeNull();
    await user.click(screen.getByRole('button', { name: /set up provider/i }));
    expect(screen.getByRole('dialog', { name: /set up your provider/i })).toBeTruthy();
  });

  it('marks the assistant configured after the in-panel form saves', async () => {
    const user = userEvent.setup();
    const onProviderConfigured = vi.fn();
    render(
      <CreativeToolsContext.Provider value={tools(async () => ({ ok: true }))}>
        <AssistantPanel
          chat={chat([])}
          onClose={() => undefined}
          configured={false}
          onProviderConfigured={onProviderConfigured}
        />
      </CreativeToolsContext.Provider>,
    );

    await user.click(screen.getByRole('button', { name: /set up provider/i }));
    await user.click(screen.getByRole('button', { name: /^save$/i }));
    expect(onProviderConfigured).toHaveBeenCalledWith('gpt-4o-mini');
  });
});
