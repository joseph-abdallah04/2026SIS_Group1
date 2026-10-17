import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';

import { BoardRail, type BoardRailSide } from './BoardRail';

function Harness({ side }: { side: BoardRailSide }) {
  const [collapsed, setCollapsed] = useState(false);
  return (
    <BoardRail
      side={side}
      title="Dock title"
      collapsed={collapsed}
      onToggle={() => setCollapsed((open) => !open)}
      expandLabel="Expand dock"
      collapseLabel="Collapse dock"
      collapsedExtra={<p>Strip extra</p>}
    >
      <p>Open body</p>
    </BoardRail>
  );
}

describe('BoardRail', () => {
  it('puts the title outside the collapse control on the left', () => {
    render(<Harness side="left" />);
    const rail = screen.getByRole('complementary', { name: 'Dock title' });
    expect(rail.querySelector(':scope > div')?.textContent).toMatch(/^Dock title/);
    const collapse = screen.getByRole('button', { name: 'Collapse dock' });
    expect(collapse.querySelector('[data-rail-icon="collapse"]')).toHaveClass(
      'lucide-panel-left-close',
    );
    expect(collapse).toHaveAttribute('aria-expanded', 'true');
  });

  it('mirrors the header on the right without changing the chrome', () => {
    render(<Harness side="right" />);
    const rail = screen.getByRole('complementary', { name: 'Dock title' });
    expect(rail.querySelector(':scope > div')?.textContent).toMatch(/Dock title$/);
    const collapse = screen.getByRole('button', { name: 'Collapse dock' });
    expect(collapse.querySelector('[data-rail-icon="collapse"]')).toHaveClass(
      'lucide-panel-right-close',
    );
    expect(collapse).toHaveAttribute('aria-expanded', 'true');
  });

  it('names either side the same way, and reports when it closes', async () => {
    const { rerender } = render(<Harness side="left" />);
    expect(screen.getByRole('complementary', { name: 'Dock title' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Collapse dock' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );

    rerender(<Harness side="right" />);
    expect(screen.getByRole('complementary', { name: 'Dock title' })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Collapse dock' }));
    expect(screen.getByRole('button', { name: 'Expand dock' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
  });

  it('keeps the strip title when collapsed', async () => {
    render(<Harness side="right" />);
    await userEvent.click(screen.getByRole('button', { name: 'Collapse dock' }));
    expect(screen.getByText('Dock title')).toBeInTheDocument();
    expect(screen.getByText('Strip extra')).toBeInTheDocument();
    expect(screen.queryByText('Open body')).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Expand dock' }).querySelector('[data-rail-icon]'),
    ).toHaveClass('lucide-panel-right-open');
  });
});

describe('BoardRail with an activity bar', () => {
  function WithBar({ startOpen = false }: { startOpen?: boolean }) {
    const [collapsed, setCollapsed] = useState(!startOpen);
    return (
      <BoardRail
        side="right"
        title="Side panel"
        panelTitle="People"
        collapsed={collapsed}
        onToggle={() => setCollapsed((open) => !open)}
        expandLabel="Open side panel"
        collapseLabel="Collapse side panel"
        resize={{ storageKey: 'bar-test', label: 'Resize side panel' }}
        strip={
          <button type="button" onClick={() => setCollapsed((open) => !open)}>
            Bar button
          </button>
        }
      >
        <p>Open body</p>
      </BoardRail>
    );
  }

  const rail = () => screen.getByRole('complementary', { name: 'Side panel' });

  it('shows the bar in place of the strip toggle and title while collapsed', () => {
    render(<WithBar />);
    expect(screen.getByRole('button', { name: 'Bar button' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Open side panel' })).not.toBeInTheDocument();
    expect(screen.queryByText('Side panel')).not.toBeInTheDocument();
    expect(screen.queryByText('Open body')).not.toBeInTheDocument();
  });

  it('opens the panel on the board side of the bar, headed by its own title', async () => {
    render(<WithBar />);
    await userEvent.click(screen.getByRole('button', { name: 'Bar button' }));

    const [panel, bar] = Array.from(rail().children) as HTMLElement[];
    expect(within(panel!).getByText('Open body')).toBeInTheDocument();
    expect(within(panel!).getByText('People')).toBeInTheDocument();
    // The bar is the rail's last child: the screen edge, where it always is.
    expect(bar).toContainElement(screen.getByRole('button', { name: 'Bar button' }));
    expect(screen.getByRole('button', { name: 'Collapse side panel' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
  });

  it('closes and reopens in one drag, because the rail never unmounts', () => {
    render(<WithBar startOpen />);
    fireEvent.pointerDown(screen.getByRole('separator', { name: 'Resize side panel' }), {
      clientX: 1000,
      button: 0,
    });
    // A right-hand rail grows to the left: moving right narrows it, past the
    // minimum and its grace distance, and it closes.
    fireEvent.pointerMove(window, { clientX: 1000 + 400 });
    expect(screen.queryByText('Open body')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Bar button' })).toBeInTheDocument();

    fireEvent.pointerMove(window, { clientX: 1000 - 20 });
    expect(screen.getByText('Open body')).toBeInTheDocument();
    fireEvent.pointerUp(window);
  });
});
