import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { StudioToolRail, type RailTool } from './StudioToolRail';

function renderRail(overrides: Partial<Parameters<typeof StudioToolRail>[0]> = {}) {
  const props = {
    tool: 'select' as RailTool,
    onToolChange: vi.fn(),
    canUndo: true,
    canRedo: true,
    onUndo: vi.fn(),
    onRedo: vi.fn(),
    showGrid: true,
    onToggleGrid: vi.fn(),
    snapEnabled: true,
    onToggleSnap: vi.fn(),
    freehandOptions: <button type="button">Erase</button>,
    shapeOptions: <button type="button">Add box</button>,
    penOptions: <button type="button">Pen width</button>,
    tableOptions: <button type="button">3 x 3</button>,
    templateOptions: <button type="button">Flow</button>,
    onAddText: vi.fn(),
    ...overrides,
  };
  render(<StudioToolRail {...props} />);
  return props;
}

describe('the tool rail', () => {
  it('offers every tool, with select first', () => {
    renderRail();
    const tools = screen.getByRole('toolbar', { name: 'Studio tools' });
    const names = [...tools.querySelectorAll('button')].map((button) =>
      button.getAttribute('aria-label'),
    );
    expect(names).toEqual(['Select', 'Freehand', 'Pen', 'Shapes', 'Text', 'Table', 'Templates']);
  });

  it('marks the active tool, and only that one', () => {
    renderRail({ tool: 'pen' });
    expect(screen.getByRole('button', { name: 'Pen' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Select' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('lights freehand while erasing, since the eraser lives inside it', () => {
    // The eraser is a mode of drawing, not a peer of it, so the rail must not
    // look as though no tool is chosen while it is in use.
    renderRail({ tool: 'erase' });
    expect(screen.getByRole('button', { name: 'Freehand' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('lights shapes while the line tool is in use', () => {
    renderRail({ tool: 'line' });
    expect(screen.getByRole('button', { name: 'Shapes' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('reports the tool that was picked', async () => {
    const user = userEvent.setup();
    const props = renderRail();
    await user.click(screen.getByRole('button', { name: 'Pen' }));
    expect(props.onToolChange).toHaveBeenCalledWith('pen');
  });

  it('places text straight away rather than arming a tool', async () => {
    const user = userEvent.setup();
    const props = renderRail();
    await user.click(screen.getByRole('button', { name: 'Text' }));
    expect(props.onAddText).toHaveBeenCalledTimes(1);
    expect(props.onToolChange).not.toHaveBeenCalled();
  });

  it('separates tools, history and canvas settings into their own groups', () => {
    // Three clusters rather than one long rail, so undo can be found without
    // reading past every tool.
    renderRail();
    expect(screen.getAllByRole('toolbar').map((bar) => bar.getAttribute('aria-label'))).toEqual([
      'Studio tools',
      'History',
      'Canvas',
    ]);
  });

  it('disables undo and redo when there is no history to step through', () => {
    renderRail({ canUndo: false, canRedo: false });
    expect(screen.getByRole('button', { name: 'Undo diagram change' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Redo diagram change' })).toBeDisabled();
  });

  it('steps through history', async () => {
    const user = userEvent.setup();
    const props = renderRail();
    await user.click(screen.getByRole('button', { name: 'Undo diagram change' }));
    await user.click(screen.getByRole('button', { name: 'Redo diagram change' }));
    expect(props.onUndo).toHaveBeenCalledTimes(1);
    expect(props.onRedo).toHaveBeenCalledTimes(1);
  });

  it('shows the state of the canvas toggles', async () => {
    const user = userEvent.setup();
    const props = renderRail({ showGrid: false, snapEnabled: true });
    expect(screen.getByRole('button', { name: 'Show grid' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    expect(screen.getByRole('button', { name: 'Snap to grid' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await user.click(screen.getByRole('button', { name: 'Snap to grid' }));
    expect(props.onToggleSnap).toHaveBeenCalledTimes(1);
  });

  it('locks the tools while a proposal is in flight, but not the canvas toggles', () => {
    // Changing tools mid-submit would strand the artifact being sent; looking at
    // the grid does no harm.
    renderRail({ disabled: true });
    expect(screen.getByRole('button', { name: 'Pen' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Show grid' })).toBeEnabled();
  });

  it('names every control, since the rail is icon-only', () => {
    renderRail();
    for (const button of screen.getAllByRole('button')) {
      expect(button.getAttribute('aria-label')?.length ?? 0).toBeGreaterThan(0);
    }
  });
});

describe('the rail sub-toolbars', () => {
  it('keeps a set of options hidden until its tool is opened', () => {
    renderRail();
    expect(screen.queryByRole('button', { name: 'Add box' })).toBeNull();
  });

  it('opens the options belonging to the tool that was pressed', async () => {
    const user = userEvent.setup();
    renderRail();
    await user.click(screen.getByRole('button', { name: 'Shapes' }));
    expect(screen.getByRole('group', { name: 'Shapes options' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add box' })).toBeInTheDocument();
    // The eraser belongs to freehand, so it must not have come along.
    expect(screen.queryByRole('button', { name: 'Erase' })).toBeNull();
  });

  it('opens only one sub-toolbar at a time', async () => {
    const user = userEvent.setup();
    renderRail();
    await user.click(screen.getByRole('button', { name: 'Freehand' }));
    await user.click(screen.getByRole('button', { name: 'Table' }));
    expect(screen.queryByRole('button', { name: 'Erase' })).toBeNull();
    expect(screen.getByRole('button', { name: '3 x 3' })).toBeInTheDocument();
  });

  it('arms the tool as well as opening its options', async () => {
    const user = userEvent.setup();
    const props = renderRail();
    await user.click(screen.getByRole('button', { name: 'Freehand' }));
    expect(props.onToolChange).toHaveBeenCalledWith('draw');
    expect(screen.getByRole('button', { name: 'Erase' })).toBeInTheDocument();
  });

  it('says whether a set of options is open', async () => {
    const user = userEvent.setup();
    renderRail();
    const templates = screen.getByRole('button', { name: 'Templates' });
    expect(templates).toHaveAttribute('aria-expanded', 'false');
    await user.click(templates);
    expect(templates).toHaveAttribute('aria-expanded', 'true');
  });

  it('closes on a press outside, and on Escape', async () => {
    const user = userEvent.setup();
    renderRail();
    const shapes = screen.getByRole('button', { name: 'Shapes' });

    await user.click(shapes);
    await user.click(document.body);
    expect(screen.queryByRole('button', { name: 'Add box' })).toBeNull();

    await user.click(shapes);
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('button', { name: 'Add box' })).toBeNull();
    // Escape must not strand focus at the top of the document.
    expect(shapes).toHaveFocus();
  });

  it('pressing the tool again closes its options', async () => {
    const user = userEvent.setup();
    renderRail();
    const pen = screen.getByRole('button', { name: 'Pen' });
    await user.click(pen);
    await user.click(pen);
    expect(screen.queryByRole('button', { name: 'Pen width' })).toBeNull();
  });

  it('closes an open sub-toolbar when select is chosen', async () => {
    // Select has no options of its own, so anything left open would belong to a
    // tool that is no longer armed.
    const user = userEvent.setup();
    renderRail();
    await user.click(screen.getByRole('button', { name: 'Table' }));
    await user.click(screen.getByRole('button', { name: 'Select' }));
    expect(screen.queryByRole('button', { name: '3 x 3' })).toBeNull();
  });
});

describe('tooltips on the rail', () => {
  it('names the tool and its shortcut on hover', async () => {
    const user = userEvent.setup();
    renderRail();
    await user.hover(screen.getByRole('button', { name: 'Pen' }));

    expect(await screen.findByText('P')).toBeInTheDocument();
  });

  it('shows the same tooltip on keyboard focus', async () => {
    // A keyboard user never hovers, so focus has to open it too.
    const user = userEvent.setup();
    renderRail();
    await user.tab();
    expect(await screen.findByText('V')).toBeInTheDocument();
  });

  it('hides the tooltip again when the pointer leaves', async () => {
    const user = userEvent.setup();
    renderRail();
    const pen = screen.getByRole('button', { name: 'Pen' });
    await user.hover(pen);
    expect(await screen.findByText('P')).toBeInTheDocument();
    await user.unhover(pen);
    expect(screen.queryByText('P')).toBeNull();
  });

  it('keeps the tooltip out of the accessible name, so it is not read twice', async () => {
    const user = userEvent.setup();
    renderRail();
    await user.hover(screen.getByRole('button', { name: 'Pen' }));
    const tip = await screen.findByText('P');
    expect(tip.closest('[aria-hidden="true"]')).not.toBeNull();
  });
});
