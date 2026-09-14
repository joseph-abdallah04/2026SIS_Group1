import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { StudioPropertiesBar } from './StudioPropertiesBar';
import { studioPropertyDescriptor, type StudioPropertyId } from '../studioProperties';

function renderBar(
  overrides: Partial<Parameters<typeof StudioPropertiesBar>[0]> = {},
  ids: StudioPropertyId[] = ['fillColor', 'strokeColor', 'strokeWidth'],
) {
  const props = {
    properties: ids.map(studioPropertyDescriptor),
    renderControl: (property: { id: string; label: string }) => (
      <button type="button" aria-label={property.label}>
        {property.id}
      </button>
    ),
    selection: { x: 300, y: 200, width: 200, height: 100 },
    viewport: { x: 0, y: 0, width: 900, height: 600 },
    selectionSize: 1,
    onAlign: vi.fn(),
    onDistribute: vi.fn(),
    ...overrides,
  };
  render(<StudioPropertiesBar {...props} />);
  return props;
}

describe('the properties bar', () => {
  it('shows a control for every property the selection supports', () => {
    renderBar();
    const bar = screen.getByRole('toolbar', { name: 'Selection properties' });
    expect(bar).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Fill' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Line colour' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Line width' })).toBeInTheDocument();
  });

  it('renders in the order it was given, which the registry keeps canonical', () => {
    // A control that moves depending on what is selected can never be found by
    // muscle memory. The order is decided once, in the registry, and the bar
    // does not second-guess it.
    renderBar({}, ['fillColor', 'strokeColor', 'strokeWidth', 'textFormat']);
    const names = [...screen.getByRole('toolbar').querySelectorAll('button')].map((button) =>
      button.getAttribute('aria-label'),
    );
    expect(names).toEqual(['Fill', 'Line colour', 'Line width', 'Format text']);
  });

  it('shows nothing but alignment when a mixed selection shares no property', async () => {
    // Ink and a table's cells have nothing to style in common, but they can
    // still be lined up — which is what keeps the bar from being empty.
    const user = userEvent.setup();
    renderBar({ selectionSize: 2 }, []);
    expect(screen.queryByRole('button', { name: 'Fill' })).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Align' }));
    expect(screen.getByRole('button', { name: 'Align left' })).toBeInTheDocument();
  });

  it('keeps alignment away from a single element, which has nothing to align to', () => {
    renderBar({ selectionSize: 1 });
    expect(screen.queryByRole('button', { name: 'Align' })).toBeNull();
  });

  it('withholds distribution from a pair, which has only one gap', async () => {
    const user = userEvent.setup();
    renderBar({ selectionSize: 2 });
    await user.click(screen.getByRole('button', { name: 'Align' }));
    expect(screen.queryByRole('button', { name: 'Distribute horizontally' })).toBeNull();
  });

  it('offers distribution once there is a gap to even out', async () => {
    const user = userEvent.setup();
    renderBar({ selectionSize: 3 });
    await user.click(screen.getByRole('button', { name: 'Align' }));
    expect(screen.getByRole('button', { name: 'Distribute horizontally' })).toBeInTheDocument();
  });

  it('reports what was pressed', async () => {
    const user = userEvent.setup();
    const props = renderBar({ selectionSize: 3 });
    await user.click(screen.getByRole('button', { name: 'Align' }));
    await user.click(screen.getByRole('button', { name: 'Align right' }));
    // Choosing one puts the strip away again.
    await user.click(screen.getByRole('button', { name: 'Align' }));
    await user.click(screen.getByRole('button', { name: 'Distribute vertically' }));
    expect(props.onAlign).toHaveBeenCalledWith('right');
    expect(props.onDistribute).toHaveBeenCalledWith('vertical');
  });

  it('carries the selection’s actions alongside its properties', () => {
    renderBar({
      actions: (
        <button type="button" aria-label="Delete">
          x
        </button>
      ),
    });
    expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument();
  });

  it('is a toolbar, since it is a row of icon-only controls', () => {
    renderBar();
    expect(screen.getByRole('toolbar', { name: 'Selection properties' })).toHaveAttribute(
      'aria-orientation',
      'horizontal',
    );
  });

  it('watches its own size instead of re-checking it every render', () => {
    // Measuring on every render is a loop waiting to happen, and it happened:
    // the measurement feeds the position, the position is a render, the render
    // measures again. In a browser the readings alternated between the bar's
    // real size and zero — while the studio opens or closes it has no layout
    // box — and never settled, which took the whole page down. jsdom reports
    // zero for everything, so only the shape of the fix can be asserted here:
    // one observer, watching the bar.
    const observed: Element[] = [];
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe(element: Element) {
          observed.push(element);
        }
        unobserve() {}
        disconnect() {}
      },
    );

    try {
      renderBar();
      expect(observed).toHaveLength(1);
      expect(observed[0]).toBe(screen.getByRole('toolbar', { name: 'Selection properties' }));
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('settles in rather than appearing', () => {
    renderBar();
    expect(screen.getByRole('toolbar')).toHaveClass('rt-studio-rise');
  });

  it('says which side of the selection it settled on', () => {
    // jsdom measures nothing, so the bar has no height here and lands above;
    // the placement arithmetic itself is covered without a DOM.
    renderBar();
    expect(screen.getByRole('toolbar')).toHaveAttribute('data-side', 'above');
  });
});
