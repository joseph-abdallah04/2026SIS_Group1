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
    const { container } = render(<Harness side="left" />);
    const header = container.querySelector('aside > div');
    expect(header?.textContent).toMatch(/^Dock title/);
    expect(screen.getByRole('button', { name: 'Collapse dock' })).toHaveTextContent('‹');
    expect(container.querySelector('aside')?.className).toMatch(/border-r/);
  });

  it('mirrors the header on the right without changing the chrome', () => {
    const { container } = render(<Harness side="right" />);
    const header = container.querySelector('aside > div');
    expect(header?.textContent).toMatch(/Dock title$/);
    expect(screen.getByRole('button', { name: 'Collapse dock' })).toHaveTextContent('›');
    expect(container.querySelector('aside')?.className).toMatch(/border-l/);
    expect(container.querySelector('aside')?.className).toMatch(/w-64/);
    expect(container.querySelector('aside')?.className).toMatch(/basis-64/);
  });

  it('uses the same expanded width and padding on both sides', () => {
    const left = render(<Harness side="left" />).container.querySelector('aside')?.className;
    const right = render(<Harness side="right" />).container.querySelector('aside')?.className;
    for (const token of ['w-64', 'min-w-64', 'max-w-64', 'basis-64', 'px-3']) {
      expect(left).toContain(token);
      expect(right).toContain(token);
    }
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
