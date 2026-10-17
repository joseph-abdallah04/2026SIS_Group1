import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { SidePanelStrip, type AssistantMarks } from './SidePanelStrip';

const QUIET: AssistantMarks = { unread: false, unconfigured: false, busy: false };

function renderStrip(
  marks: Partial<AssistantMarks>,
  active: 'people' | 'chat' | 'assistant' | null = null,
) {
  return render(
    <SidePanelStrip
      active={active}
      onSelect={() => undefined}
      assistant={{ ...QUIET, ...marks }}
      panelId="panel"
      buttonRef={() => undefined}
    />,
  );
}

const mark = () => document.querySelector('[data-strip-mark]')?.getAttribute('data-strip-mark');

describe('SidePanelStrip', () => {
  it('marks the assistant, most pressing news first', () => {
    const { rerender } = renderStrip({ unread: true, unconfigured: true, busy: true });
    expect(mark()).toBe('unread');
    expect(screen.getByRole('button', { name: 'Assistant, new answer' })).toBeInTheDocument();

    rerender(
      <SidePanelStrip
        active={null}
        onSelect={() => undefined}
        assistant={{ ...QUIET, unconfigured: true, busy: true }}
        panelId="panel"
        buttonRef={() => undefined}
      />,
    );
    expect(mark()).toBe('unconfigured');
    expect(
      screen.getByRole('button', { name: 'Assistant, no AI provider set up' }),
    ).toBeInTheDocument();
  });

  it('drops the marks while the assistant is the one showing', () => {
    renderStrip({ unconfigured: true }, 'assistant');
    expect(mark()).toBeUndefined();
    expect(screen.getByRole('button', { name: 'Assistant' })).toHaveAttribute(
      'aria-controls',
      'panel',
    );
  });

  it('controls the panel only from the pressed button', () => {
    renderStrip({}, 'people');
    expect(screen.getByRole('button', { name: 'People' })).toHaveAttribute(
      'aria-controls',
      'panel',
    );
    expect(screen.getByRole('button', { name: 'Chat' })).not.toHaveAttribute('aria-controls');
  });
});
