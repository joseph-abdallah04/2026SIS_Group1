import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { type Catalogue, type Role } from '../catalogue/types';
import { type Inspection } from '../detect/inspect';
import { type ColourEngine, type EngineSnapshot } from '../engine/engine';
import { computeDefaultLinks } from '../model/resolve';
import { LabStore } from '../model/store';
import { buildSlotViews } from '../model/views';
import { ColourLab } from './ColourLab';
import { Inspector } from './Inspector';

const gold = { r: 241, g: 200, b: 129 };
const ink = { r: 8, g: 12, b: 21 };
const mustard = { r: 224, g: 163, b: 60 };
const originals = new Map([
  ['token:rt-primary', gold],
  ['token:rt-ink', ink],
  ['token:rt-secondary', mustard],
]);

const catalogue: Catalogue = {
  generatedAt: 0,
  git: { sha: null, branch: null, mergeBase: null },
  tokens: [
    {
      slot: 'token:rt-primary',
      name: '--color-rt-primary',
      value: '#f1c881',
      file: 'index.css',
      line: 12,
      col: 1,
      snippet: '',
    },
    {
      slot: 'token:rt-ink',
      name: '--color-rt-ink',
      value: '#080c15',
      file: 'index.css',
      line: 26,
      col: 1,
      snippet: '',
    },
    {
      slot: 'token:rt-secondary',
      name: '--color-rt-secondary',
      value: '#e0a33c',
      file: 'index.css',
      line: 15,
      col: 1,
      snippet: '',
    },
  ],
  literals: [
    {
      slot: 'hex:#080c15',
      file: 'apps/web/src/pinboardTokens.ts',
      line: 4,
      col: 1,
      raw: '#080C15',
      alpha: 1,
      role: 'text',
      context: 'CARD_INK',
      snippet: "const CARD_INK = '#080C15';",
      exportOnly: false,
    },
  ],
  classes: [],
  refs: [],
};

const snapshot: EngineSnapshot = {
  version: 1,
  originals,
  defaultLinks: computeDefaultLinks(originals, ['hex:#080c15']),
  liveHex: new Set(),
  usage: new Map([
    ['token:rt-ink', 3],
    ['token:rt-secondary', 2],
  ]),
  usageKnown: true,
  // Ink is text and a background; the mustard is both too.
  roleUse: new Map<string, Set<Role>>([
    ['token:rt-ink', new Set<Role>(['text', 'fill'])],
    ['token:rt-secondary', new Set<Role>(['text', 'fill'])],
  ]),
};

function fakeEngine() {
  const engine = {
    subscribe: () => () => undefined,
    getSnapshot: () => snapshot,
    setUsageWanted: vi.fn(),
    setCatalogueSlots: vi.fn(),
    locate: vi.fn(() => []),
    paintOf: vi.fn(() => ({ uses: [], templates: [] })),
    colourOn: vi.fn(() => null),
  };
  return engine as unknown as ColourEngine & typeof engine;
}

let store: LabStore;
let engine: ReturnType<typeof fakeEngine>;

function mount() {
  return render(
    <ColourLab
      store={store}
      engine={engine}
      catalogue={{ initial: catalogue, watch: () => () => undefined }}
    />,
  );
}

const custom = (hex: string) => ({ kind: 'custom', hex }) as const;

beforeEach(() => {
  store = new LabStore(null);
  engine = fakeEngine();
});

describe('ColourLab', () => {
  it('lists the colours on this page first, and tells the engine someone is looking', () => {
    mount();
    expect(screen.getByRole('button', { name: /Edit Ink, #080c15/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Edit Primary/ })).not.toBeInTheDocument();
    expect(engine.setUsageWanted).toHaveBeenCalledWith(true);
  });

  it('shows everything under All, the copies of a token included', async () => {
    mount();
    await userEvent.click(screen.getByRole('tab', { name: /All/ }));
    expect(screen.getByRole('button', { name: /Edit Primary/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Edit #080c15/ })).toBeInTheDocument();
    expect(screen.getByTitle(/Follows Ink/)).toBeInTheDocument();
  });

  it('narrows the list with the search box', async () => {
    mount();
    await userEvent.click(screen.getByRole('tab', { name: /All/ }));
    await userEvent.type(screen.getByPlaceholderText(/Search/), 'gold');
    expect(screen.getByRole('button', { name: /Edit Primary/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Edit Ink/ })).not.toBeInTheDocument();
  });

  it('opens a picker from a swatch, and a hex typed there is applied', async () => {
    mount();
    await userEvent.click(screen.getByRole('button', { name: /Edit Ink/ }));
    const picker = screen.getByRole('group', { name: 'Edit Ink' });
    const hex = within(picker).getByDisplayValue('080c15');
    await userEvent.clear(hex);
    await userEvent.type(hex, 'ff0000');
    await waitFor(() =>
      expect(store.getState().edits.light['token:rt-ink']).toEqual({ base: custom('#ff0000') }),
    );
  });

  it("sets one role of a colour apart from the rest, from the picker's role tabs", async () => {
    mount();
    await userEvent.click(screen.getByRole('button', { name: /Edit Secondary/ }));
    const picker = screen.getByRole('group', { name: 'Edit Secondary' });
    await userEvent.click(within(picker).getByRole('tab', { name: 'Fill' }));
    expect(within(picker).getByText(/Fill follows All/)).toBeInTheDocument();
    const hex = within(picker).getByDisplayValue('e0a33c');
    await userEvent.clear(hex);
    await userEvent.type(hex, '8a5c12');
    await waitFor(() =>
      expect(store.getState().edits.light['token:rt-secondary']).toEqual({
        roles: { fill: custom('#8a5c12') },
      }),
    );
  });

  it('takes a role back to following All', async () => {
    store.setSpec('light', 'token:rt-secondary', custom('#8a5c12'), 'fill');
    mount();
    await userEvent.click(screen.getByRole('button', { name: /Edit Secondary/ }));
    const picker = screen.getByRole('group', { name: 'Edit Secondary' });
    await userEvent.click(within(picker).getByRole('tab', { name: 'Fill' }));
    expect(within(picker).getByText(/Fill has a colour of its own/)).toBeInTheDocument();
    await userEvent.click(within(picker).getByRole('button', { name: /Follow All/ }));
    expect(store.getState().edits.light['token:rt-secondary']).toBeUndefined();
  });

  it('puts the original back from the row', async () => {
    store.setSpec('light', 'token:rt-ink', custom('#ff0000'));
    mount();
    // Ink, and the hardcoded copy that follows it.
    expect(screen.getByTitle('2 changed in the light theme')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Reset Ink' }));
    expect(store.getState().edits.light['token:rt-ink']).toBeUndefined();
  });

  it('resets everything in the theme being shown, and only that one', async () => {
    store.setSpec('light', 'token:rt-ink', custom('#ff0000'));
    store.setSpec('dark', 'token:rt-ink', custom('#00ff00'));
    mount();
    await userEvent.click(screen.getByRole('button', { name: 'Reset every colour' }));
    expect(store.getState().edits.light).toEqual({});
    expect(store.getState().edits.dark).not.toEqual({});
  });

  it('folds into a pill and opens again', async () => {
    mount();
    await userEvent.click(screen.getByRole('button', { name: 'Minimise' }));
    expect(screen.queryByRole('region', { name: 'Colour Lab' })).not.toBeInTheDocument();
    expect(engine.setUsageWanted).toHaveBeenLastCalledWith(false);
    await userEvent.click(screen.getByRole('button', { name: 'Open Colour Lab' }));
    expect(screen.getByRole('region', { name: 'Colour Lab' })).toBeInTheDocument();
  });

  it('unlinks a copy from its token, keeping the colour it has', async () => {
    store.setSpec('light', 'token:rt-ink', custom('#102a43'));
    mount();
    await userEvent.click(screen.getByRole('tab', { name: /Changed/ }));
    await userEvent.click(screen.getByTitle(/Follows Ink/));
    // The copy now has a colour of its own, the one it was showing.
    await waitFor(() => expect(store.getState().edits.light['hex:#080c15']).toBeDefined());
  });

  it('closes the picker with Escape', async () => {
    mount();
    await userEvent.click(screen.getByRole('button', { name: /Edit Ink/ }));
    expect(screen.getByRole('group', { name: 'Edit Ink' })).toBeInTheDocument();
    await act(async () => {
      await userEvent.keyboard('{Escape}');
    });
    expect(screen.queryByRole('group', { name: 'Edit Ink' })).not.toBeInTheDocument();
  });
});

describe('the theme toggle', () => {
  it('switches the store between the light and the dark theme', async () => {
    mount();
    expect(screen.getByRole('button', { name: 'Light' })).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(screen.getByRole('button', { name: 'Dark' }));
    expect(store.getState().scheme).toBe('dark');
    expect(screen.getByRole('button', { name: 'Dark' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('shows the dark palette in the dark theme, and the colour the app has in the details', async () => {
    store.setScheme('dark');
    mount();
    expect(screen.getByRole('button', { name: /Edit Ink, #eceef3/ })).toBeInTheDocument();
    await userEvent.click(screen.getByText('Ink'));
    expect(screen.getByText(/Dark palette: #eceef3. The app has #080c15./)).toBeInTheDocument();
  });

  it("keeps each theme's edits to itself", async () => {
    store.setScheme('dark');
    mount();
    await userEvent.click(screen.getByRole('button', { name: /Edit Ink/ }));
    const hex = within(screen.getByRole('group', { name: 'Edit Ink' })).getByDisplayValue('eceef3');
    await userEvent.clear(hex);
    await userEvent.type(hex, 'ffffff');
    await waitFor(() => expect(store.getState().edits.dark['token:rt-ink']).toBeDefined());
    expect(store.getState().edits.light).toEqual({});
  });

  it('marks a colour that is split by role in the dark palette', () => {
    store.setScheme('dark');
    mount();
    // Mustard is bright as text and deep as a fill.
    expect(screen.getByTitle(/Text #e0a33c, Fill #8a5c12/)).toBeInTheDocument();
  });
});

describe('Inspector', () => {
  const views = new Map(
    buildSlotViews({
      catalogue,
      scheme: 'light',
      originals,
      defaultLinks: snapshot.defaultLinks,
      liveHex: new Set(),
      usage: new Map(),
      roleUse: snapshot.roleUse,
      usageKnown: false,
      edits: {},
    }).map((view) => [view.key, view]),
  );
  const element = document.createElement('button');
  const parent = document.createElement('div');

  const inspection = (over: Partial<Inspection> = {}): Inspection => ({
    element,
    label: 'button.bg-rt-secondary.text-rt-ink',
    findings: [
      { role: 'text', colour: { ...ink, a: 1 }, slots: ['token:rt-ink'], from: parent },
      { role: 'fill', colour: { ...mustard, a: 1 }, slots: ['token:rt-secondary'], from: element },
      { role: 'border', colour: { r: 1, g: 2, b: 3, a: 1 }, slots: [], from: element },
    ],
    contrast: {
      ratio: 8.2,
      verdict: 'AAA',
      foreground: ink,
      background: mustard,
    },
    ...over,
  });

  const renderInspector = (data = inspection()) => {
    const handlers = { onEdit: vi.fn(), onBack: vi.fn(), onPickAgain: vi.fn(), onHover: vi.fn() };
    render(<Inspector inspection={data} views={views} {...handlers} />);
    return handlers;
  };

  it('names what paints each role, and edits it from there', async () => {
    const { onEdit } = renderInspector();
    expect(screen.getByText('button.bg-rt-secondary.text-rt-ink')).toBeInTheDocument();
    expect(screen.getByText('Text')).toBeInTheDocument();
    expect(screen.getByText('Fill')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Secondary' }));
    expect(onEdit).toHaveBeenCalledWith('token:rt-secondary', 'fill', expect.anything());
    await userEvent.click(screen.getByRole('button', { name: 'Ink' }));
    expect(onEdit).toHaveBeenLastCalledWith('token:rt-ink', 'text', expect.anything());
  });

  it('says so when a colour cannot be traced to one the lab can change', () => {
    renderInspector();
    expect(screen.getByText(/Not set by a colour the lab can change/)).toBeInTheDocument();
  });

  it('scores the text against what is behind it', () => {
    renderInspector();
    expect(screen.getByText('8.20 : 1')).toBeInTheDocument();
    expect(screen.getByText('AAA')).toBeInTheDocument();
  });

  it('says plainly when the text fails', () => {
    renderInspector(
      inspection({
        contrast: { ratio: 1.9, verdict: 'fail', foreground: ink, background: mustard },
      }),
    );
    expect(screen.getByText('Fails')).toBeInTheDocument();
    expect(screen.getByText(/aim for 4.5 or more/)).toBeInTheDocument();
  });

  it('points at the parent a colour is inherited from', async () => {
    const { onHover } = renderInspector();
    await userEvent.hover(screen.getByText(/Inherited from a parent/));
    expect(onHover).toHaveBeenCalledWith(parent);
  });

  it('goes back to the list, or picks again', async () => {
    const { onBack, onPickAgain } = renderInspector();
    await userEvent.click(screen.getByRole('button', { name: 'Back to the list' }));
    await userEvent.click(screen.getByRole('button', { name: /Pick again/ }));
    expect(onBack).toHaveBeenCalled();
    expect(onPickAgain).toHaveBeenCalled();
  });

  it('says so when nothing is painted', () => {
    renderInspector(inspection({ findings: [], contrast: null }));
    expect(screen.getByText(/Nothing is painted/)).toBeInTheDocument();
  });
});
