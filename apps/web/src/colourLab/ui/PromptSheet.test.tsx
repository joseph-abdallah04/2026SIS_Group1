import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { type Catalogue, type Role } from '../catalogue/types';
import { type ColourEngine, type EngineSnapshot } from '../engine/engine';
import { computeDefaultLinks } from '../model/resolve';
import { LabStore } from '../model/store';
import { STATE_FORMAT } from '../prompt/state';
import { ColourLab } from './ColourLab';

const ink = { r: 8, g: 12, b: 21 };
const mustard = { r: 224, g: 163, b: 60 };
const originals = new Map([
  ['token:rt-ink', ink],
  ['token:rt-secondary', mustard],
]);

const catalogue: Catalogue = {
  generatedAt: 0,
  git: {
    sha: 'f1d9446abcdef0123456789abcdef0123456789a',
    branch: 'colour-testing',
    mergeBase: null,
  },
  tokens: [
    {
      slot: 'token:rt-ink',
      name: '--color-rt-ink',
      value: '#080c15',
      file: 'apps/web/src/index.css',
      line: 26,
      col: 19,
      snippet: '--color-rt-ink: #080c15;',
    },
    {
      slot: 'token:rt-secondary',
      name: '--color-rt-secondary',
      value: '#e0a33c',
      file: 'apps/web/src/index.css',
      line: 20,
      col: 25,
      snippet: '--color-rt-secondary: #e0a33c;',
    },
  ],
  literals: [
    {
      slot: 'hex:#080c15',
      file: 'apps/web/src/pinboardTokens.ts',
      line: 4,
      col: 21,
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
  usage: new Map([['token:rt-ink', 3]]),
  usageKnown: true,
  roleUse: new Map<string, Set<Role>>([['token:rt-ink', new Set<Role>(['text'])]]),
};

function fakeEngine() {
  return {
    subscribe: () => () => undefined,
    getSnapshot: () => snapshot,
    setUsageWanted: vi.fn(),
    setCatalogueSlots: vi.fn(),
    locate: vi.fn(() => []),
    paintOf: vi.fn(() => ({ uses: [], templates: [] })),
    colourOn: vi.fn(() => null),
  } as unknown as ColourEngine;
}

let store: LabStore;

function mount() {
  return render(
    <ColourLab
      store={store}
      engine={fakeEngine()}
      catalogue={{ initial: catalogue, watch: () => () => undefined }}
    />,
  );
}

const custom = (hex: string) => ({ kind: 'custom', hex }) as const;

const saved = { urls: [] as Blob[], names: [] as string[] };

beforeEach(() => {
  store = new LabStore(null);
  saved.urls = [];
  saved.names = [];
  URL.createObjectURL = vi.fn((blob: Blob) => {
    saved.urls.push(blob);
    return 'blob:colour-lab';
  });
  URL.revokeObjectURL = vi.fn();
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    saved.names.push(this.download);
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('the prompt buttons', () => {
  it('are in the footer, one for each theme', () => {
    mount();
    const group = screen.getByRole('group', { name: 'Make a prompt' });
    expect(within(group).getByRole('button', { name: /Create light prompt/ })).toBeInTheDocument();
    expect(within(group).getByRole('button', { name: /Create dark prompt/ })).toBeInTheDocument();
  });

  it('show how many colours have been changed in each theme', () => {
    store.setSpec('light', 'token:rt-ink', custom('#101828'));
    store.setSpec('dark', 'token:rt-ink', custom('#ffffff'));
    store.setSpec('dark', 'token:rt-secondary', custom('#aa7700'));
    mount();
    expect(screen.getByRole('button', { name: /Create light prompt/ })).toHaveTextContent('1');
    expect(screen.getByRole('button', { name: /Create dark prompt/ })).toHaveTextContent('2');
  });
});

describe('the light prompt', () => {
  it('says so when there is nothing to apply, and offers nothing to take', async () => {
    mount();
    await userEvent.click(screen.getByRole('button', { name: /Create light prompt/ }));
    const sheet = screen.getByRole('region', { name: 'Light-theme prompt' });
    expect(sheet).toHaveTextContent(/no light-theme changes/i);
    expect(within(sheet).queryByRole('button', { name: /Download/ })).not.toBeInTheDocument();
  });

  it('says what it holds when a colour has been changed', async () => {
    store.setSpec('light', 'token:rt-ink', custom('#101828'));
    mount();
    await userEvent.click(screen.getByRole('button', { name: /Create light prompt/ }));
    const sheet = screen.getByRole('region', { name: 'Light-theme prompt' });
    expect(sheet).toHaveTextContent('1 brand colour changes value');
    expect(sheet).toHaveTextContent(/1 hardcoded colour changes, in 1 file/);
    expect(sheet).toHaveTextContent(/roundtable-colours-light-\d{4}-\d{2}-\d{2}\.txt · \d+ KB/);
  });

  it('is saved as a text file named for the theme and the day', async () => {
    store.setSpec('light', 'token:rt-ink', custom('#101828'));
    mount();
    await userEvent.click(screen.getByRole('button', { name: /Create light prompt/ }));
    await userEvent.click(screen.getByRole('button', { name: /Download \.txt/ }));

    expect(saved.names).toHaveLength(1);
    expect(saved.names[0]).toMatch(/^roundtable-colours-light-\d{4}-\d{2}-\d{2}\.txt$/);
    const text = await saved.urls[0]!.text();
    expect(text).toContain('# RoundTable colour change: light theme');
    expect(text).toContain('`--color-rt-ink: #080c15;` → `--color-rt-ink: #101828;`');
    expect(text).toContain('node colour-lab-apply.mjs --check');
    expect(screen.getByRole('button', { name: /Saved/ })).toBeInTheDocument();
  });

  it('is copied', async () => {
    store.setSpec('light', 'token:rt-ink', custom('#101828'));
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    mount();
    await userEvent.click(screen.getByRole('button', { name: /Create light prompt/ }));
    await userEvent.click(screen.getByRole('button', { name: /^Copy/ }));
    await waitFor(() => expect(screen.getByRole('button', { name: /Copied/ })).toBeInTheDocument());
    expect(writeText).toHaveBeenCalledWith(
      expect.stringContaining('# RoundTable colour change: light theme'),
    );
  });

  it('follows the colours as they are changed while it is open', async () => {
    mount();
    await userEvent.click(screen.getByRole('button', { name: /Create light prompt/ }));
    expect(screen.getByRole('region', { name: 'Light-theme prompt' })).toHaveTextContent(
      /no light-theme changes/i,
    );
    store.setSpec('light', 'token:rt-ink', custom('#101828'));
    await waitFor(() =>
      expect(screen.getByRole('region', { name: 'Light-theme prompt' })).toHaveTextContent(
        '1 brand colour changes value',
      ),
    );
  });
});

describe('the dark prompt', () => {
  it('is there with no change of the lab’s own, since the dark theme is made for it', async () => {
    mount();
    await userEvent.click(screen.getByRole('button', { name: /Create dark prompt/ }));
    const sheet = screen.getByRole('region', { name: 'Dark-theme prompt' });
    expect(sheet).toHaveTextContent(/Appearance/);
    expect(within(sheet).getByRole('button', { name: /Download \.txt/ })).toBeInTheDocument();
  });
});

describe('the sheet', () => {
  it('goes back to the list with its button, and with Escape', async () => {
    mount();
    await userEvent.click(screen.getByRole('button', { name: /Create dark prompt/ }));
    expect(screen.getByRole('region', { name: 'Dark-theme prompt' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Back to the list' }));
    expect(screen.queryByRole('region', { name: 'Dark-theme prompt' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Edit Ink/ })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /Create dark prompt/ }));
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('region', { name: 'Dark-theme prompt' })).not.toBeInTheDocument();
  });

  it('closes when its button is pressed again', async () => {
    mount();
    const button = screen.getByRole('button', { name: /Create light prompt/ });
    await userEvent.click(button);
    await userEvent.click(button);
    expect(screen.queryByRole('region', { name: 'Light-theme prompt' })).not.toBeInTheDocument();
  });
});

describe('loading colours from a prompt', () => {
  const file = (edits: object, name = 'prompt.txt') =>
    new File(
      [
        'Some prompt text\n\n```json\n' +
          JSON.stringify({ format: STATE_FORMAT, version: 1, generatedAt: '', git: {}, edits }) +
          '\n```\n',
      ],
      name,
      { type: 'text/plain' },
    );
  const chosen = { light: { 'token:rt-ink': { base: custom('#112233') } }, dark: {} };
  const input = (): HTMLInputElement =>
    document.querySelector('input[type="file"]') as HTMLInputElement;

  it('takes them straight away when there are none of its own', async () => {
    mount();
    await userEvent.click(screen.getByRole('button', { name: /Create light prompt/ }));
    await userEvent.upload(input(), file(chosen));
    await waitFor(() =>
      expect(store.getState().edits.light['token:rt-ink']).toEqual({ base: custom('#112233') }),
    );
    expect(screen.queryByRole('region', { name: 'Light-theme prompt' })).not.toBeInTheDocument();
  });

  it('asks first when it would replace colours that were chosen', async () => {
    store.setSpec('light', 'token:rt-secondary', custom('#aa7700'));
    mount();
    await userEvent.click(screen.getByRole('button', { name: /Create light prompt/ }));
    await userEvent.upload(input(), file(chosen));
    expect(await screen.findByRole('alert')).toHaveTextContent(/Replace the colours you have now/);
    expect(store.getState().edits.light['token:rt-ink']).toBeUndefined();

    await userEvent.click(screen.getByRole('button', { name: 'Keep mine' }));
    expect(store.getState().edits.light['token:rt-secondary']).toBeDefined();

    await userEvent.upload(input(), file(chosen));
    await userEvent.click(await screen.findByRole('button', { name: 'Replace' }));
    expect(store.getState().edits.light['token:rt-ink']).toEqual({ base: custom('#112233') });
    expect(store.getState().edits.light['token:rt-secondary']).toBeUndefined();
  });

  it('says so when a file holds no colours of the lab', async () => {
    mount();
    await userEvent.click(screen.getByRole('button', { name: /Create light prompt/ }));
    await userEvent.upload(input(), new File(['just text'], 'x.txt', { type: 'text/plain' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/no Colour Lab colours/);
  });
});
