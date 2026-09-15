import { describe, expect, it } from 'vitest';

import {
  MIN_TOOL_ACTIVITY_MS,
  assistantActivityLabel,
  nextHeldActivity,
  shouldRenderToolEntry,
  turnToolActivityLabel,
} from './assistantActivity';
import type { ChatEntry } from './useAssistantChat';

const user = (text: string): ChatEntry => ({ kind: 'user', id: 'u', text });
const assistant = (text: string, streaming = false): ChatEntry => ({
  kind: 'assistant',
  id: 'a',
  text,
  streaming,
});
const tool = (
  toolName: Extract<ChatEntry, { kind: 'tool' }>['toolName'],
  status: Extract<ChatEntry, { kind: 'tool' }>['status'],
): Extract<ChatEntry, { kind: 'tool' }> => ({
  kind: 'tool',
  id: `t-${toolName}-${status}`,
  toolName,
  status,
});

describe('assistantActivityLabel', () => {
  it('is silent when the turn is over', () => {
    expect(assistantActivityLabel([user('hi'), assistant('hello')], false, false)).toBeNull();
  });

  it('is silent while waiting if the model has no reasoning channel', () => {
    expect(assistantActivityLabel([user('hi')], true, false)).toBeNull();
  });

  it('says Thinking only when the provider is streaming reasoning', () => {
    expect(assistantActivityLabel([user('hi')], true, true)).toBe('Thinking');
  });

  it('names a single running tool', () => {
    expect(assistantActivityLabel([user('hi'), tool('web_search', 'running')], true, false)).toBe(
      'Searching the web',
    );
  });

  it('counts several tools in flight', () => {
    expect(
      assistantActivityLabel(
        [user('hi'), tool('create_diagram', 'running'), tool('sticky_ideation', 'running')],
        true,
        false,
      ),
    ).toBe('Called 2 tools');
  });

  it('keeps the tool named after it finishes, until the next action', () => {
    expect(assistantActivityLabel([user('hi'), tool('create_diagram', 'done')], true, false)).toBe(
      'Drawing a diagram',
    );
  });

  it('keeps the tool named after it finishes even if the model is reasoning again', () => {
    expect(assistantActivityLabel([user('hi'), tool('create_diagram', 'done')], true, true)).toBe(
      'Drawing a diagram',
    );
  });

  it('prefers a running tool over Thinking', () => {
    expect(
      assistantActivityLabel([user('hi'), tool('sticky_ideation', 'running')], true, true),
    ).toBe('Writing sticky notes');
  });

  it('summarises several finished tools', () => {
    expect(
      assistantActivityLabel(
        [user('hi'), tool('create_diagram', 'done'), tool('sticky_ideation', 'done')],
        true,
        false,
      ),
    ).toBe('Called 2 tools');
  });

  it('hides once the reply is typing out', () => {
    expect(
      assistantActivityLabel([user('hi'), assistant('Here is a start', true)], true, true),
    ).toBeNull();
  });
});

describe('turnToolActivityLabel', () => {
  it('still names the tool after the reply has started', () => {
    expect(
      turnToolActivityLabel([
        user('hi'),
        tool('sticky_ideation', 'done'),
        assistant('Here they are', true),
      ]),
    ).toBe('Writing sticky notes');
  });
});

describe('nextHeldActivity', () => {
  it('holds a tool verb after the derived label has already moved on', () => {
    const started = nextHeldActivity(
      'Writing sticky notes',
      'Writing sticky notes',
      true,
      1_000,
      null,
    );
    expect(started.shown).toBe('Writing sticky notes');
    expect(started.hold?.until).toBe(1_000 + MIN_TOOL_ACTIVITY_MS);

    const afterText = nextHeldActivity(null, 'Writing sticky notes', true, 1_100, started.hold);
    expect(afterText.shown).toBe('Writing sticky notes');

    const afterHold = nextHeldActivity(
      null,
      'Writing sticky notes',
      true,
      started.hold!.until,
      started.hold,
    );
    expect(afterHold.shown).toBeNull();
    expect(
      nextHeldActivity(null, 'Writing sticky notes', true, started.hold!.until + 50, afterHold.hold)
        .shown,
    ).toBeNull();
  });

  it('starts a hold from the fallback when the first paint already hid the tool', () => {
    const first = nextHeldActivity(null, 'Drawing a diagram', true, 5_000, null);
    expect(first.shown).toBe('Drawing a diagram');
    expect(first.hold?.until).toBe(5_000 + MIN_TOOL_ACTIVITY_MS);
  });

  it('clears immediately when the turn ends', () => {
    const held = { label: 'Drawing a diagram', until: 9_000 };
    expect(nextHeldActivity(null, 'Drawing a diagram', false, 8_000, held)).toEqual({
      shown: null,
      hold: null,
    });
  });
});

describe('shouldRenderToolEntry', () => {
  it('keeps failed tools and search sources, hides diagram chips', () => {
    expect(shouldRenderToolEntry(tool('create_diagram', 'done'), false)).toBe(false);
    expect(shouldRenderToolEntry(tool('create_diagram', 'running'), true)).toBe(false);
    expect(shouldRenderToolEntry(tool('sticky_ideation', 'failed'), false)).toBe(true);
    expect(
      shouldRenderToolEntry(
        {
          ...tool('web_search', 'done'),
          results: [{ title: 'A', url: 'https://a.test', snippet: 'x' }],
        },
        false,
      ),
    ).toBe(true);
  });
});
