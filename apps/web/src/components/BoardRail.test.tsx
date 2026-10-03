import { render, screen } from '@testing-library/react';
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
    expect(collapse).toHaveTextContent('‹');
    expect(collapse).toHaveAttribute('aria-expanded', 'true');
  });

  it('mirrors the header on the right without changing the chrome', () => {
    render(<Harness side="right" />);
    const rail = screen.getByRole('complementary', { name: 'Dock title' });
    expect(rail.querySelector(':scope > div')?.textContent).toMatch(/Dock title$/);
    const collapse = screen.getByRole('button', { name: 'Collapse dock' });
    expect(collapse).toHaveTextContent('›');
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

  it('can open wider than the agenda column without changing the chrome', () => {
    render(
      <BoardRail
        side="right"
        width="wide"
        title="Assistant"
        collapsed={false}
        onToggle={() => undefined}
        expandLabel="Expand dock"
        collapseLabel="Collapse dock"
      >
        <p>Open body</p>
      </BoardRail>,
    );
    expect(screen.getByRole('complementary', { name: 'Assistant' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Collapse dock' })).toHaveTextContent('›');
    expect(screen.getByRole('button', { name: 'Collapse dock' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    expect(screen.getByText('Open body')).toBeInTheDocument();
  });

  it('keeps the strip title when collapsed', async () => {
    render(<Harness side="right" />);
    await userEvent.click(screen.getByRole('button', { name: 'Collapse dock' }));
    expect(screen.getByText('Dock title')).toBeInTheDocument();
    expect(screen.getByText('Strip extra')).toBeInTheDocument();
    expect(screen.queryByText('Open body')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Expand dock' })).toHaveTextContent('‹');
  });
});
