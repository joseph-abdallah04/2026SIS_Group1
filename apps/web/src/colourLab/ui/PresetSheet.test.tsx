import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { type Catalogue, type Role } from '../catalogue/types';
import { type Rgb } from '../colour/convert';
import { parseColour } from '../colour/parse';
import { type ColourEngine, type EngineSnapshot } from '../engine/engine';
import { PresetStore } from '../model/presetStore';
import { computeDefaultLinks } from '../model/resolve';
import { LabStore } from '../model/store';
import { STATE_FORMAT } from '../prompt/state';
import { ColourLab } from './ColourLab';

const rgb = (value: string): Rgb => {
  const parsed = parseColour(value);
  if (!parsed) throw new Error(value);
  return { r: parsed.rgba.r, g: parsed.rgba.g, b: parsed.rgba.b };
};

const TOKENS: Record<string, string> = {
  primary: '#f1c881',
  'primary-deep': '#7a6a4c',
  'primary-tint': '#fdf4e5',
  secondary: '#e0a33c',
  'secondary-tint': '#f1c881',
  'secondary-wash': '#fdf4e5',
  'secondary-deep': '#7a6a4c',
  cool: '#8ca4ac',
  'cool-deep': '#4d6a74',
  'cool-tint': '#eef2f4',
  tertiary: '#cfcfcf',
  surface: '#ffffff',
  'surface-alt': '#f7f7f8',
  'surface-sunken': '#fafafa',
  ink: '#080c15',
  'ink-muted': '#5a5f68',
  'ink-faint': '#8a8f97',
};

const originals = new Map(
  Object.entries(TOKENS).map(([name, value]) => [`token:rt-${name}`, rgb(value)]),
);

const catalogue: Catalogue = {
  generatedAt: 0,
  git: { sha: null, branch: null, mergeBase: null },
  tokens: Object.entries(TOKENS).map(([name, value], i) => ({
    slot: `token:rt-${name}`,
    name: `--color-rt-${name}`,
    value,
    file: 'apps/web/src/index.css',
    line: 10 + i,
    col: 3,
    snippet: '',
  })),
  literals: [],
  classes: [],
  refs: [],
};

const snapshot: EngineSnapshot = {
  version: 1,
  originals,
  defaultLinks: computeDefaultLinks(originals, []),
  liveHex: new Set(),
  usage: new Map([['token:rt-ink', 3]]),
  usageKnown: true,
  roleUse: new Map<string, Set<Role>>([['token:rt-ink', new Set<Role>(['text'])]]),
};

const engine = () =>
  ({
    subscribe: () => () => undefined,
    getSnapshot: () => snapshot,
    setUsageWanted: vi.fn(),
    setCatalogueSlots: vi.fn(),
    locate: vi.fn(() => []),
    paintOf: vi.fn(() => ({ uses: [], templates: [] })),
    colourOn: vi.fn(() => null),
  }) as unknown as ColourEngine;

class MemoryStorage {
  data = new Map<string, string>();
  getItem(key: string) {
    return this.data.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.data.set(key, value);
  }
  removeItem(key: string) {
    this.data.delete(key);
  }
}

let store: LabStore;
let presets: PresetStore;
const downloads: { name: string; blob: Blob }[] = [];

function mount() {
  return render(
    <ColourLab
      store={store}
      engine={engine()}
      presets={presets}
      catalogue={{ initial: catalogue, watch: () => () => undefined }}
    />,
  );
}

const openPresets = async () => {
  await userEvent.click(screen.getByRole('button', { name: /^Presets$/ }));
  return screen.getByRole('region', { name: 'Presets' });
};

const card = (sheet: HTMLElement, name: string): HTMLElement =>
  within(sheet)
    .getByRole('button', { name: `Apply ${name}` })
    .closest('li') as HTMLElement;

const custom = (hex: string) => ({ kind: 'custom', hex }) as const;

beforeEach(() => {
  store = new LabStore(null);
  presets = new PresetStore(new MemoryStorage() as unknown as Storage);
  downloads.length = 0;
  let last: Blob | null = null;
  URL.createObjectURL = vi.fn((blob: Blob) => {
    last = blob;
    return 'blob:x';
  });
  URL.revokeObjectURL = vi.fn();
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    if (last) downloads.push({ name: this.download, blob: last });
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('the presets', () => {
  it('are a button away, with the recommended palettes and a place for your own', async () => {
    mount();
    expect(screen.getByText('No preset applied')).toBeInTheDocument();
    const sheet = await openPresets();
    const recommended = within(sheet).getByRole('region', { name: 'Recommended' });
    const names = within(recommended)
      .getAllByRole('button', { name: /^Apply / })
      .map((b) => b.getAttribute('aria-label'));
    expect(names).toEqual([
      'Apply RoundTable',
      'Apply Peach Sorbet',
      'Apply Lavender Haze',
      'Apply Sage Garden',
      'Apply Powder Blue',
      'Apply Macaron',
      'Apply Sherbet Pop',
      'Apply Logo',
      'Apply Logo Mist',
      'Apply Head Seat',
    ]);
    expect(within(sheet).getByRole('region', { name: 'Yours' })).toHaveTextContent(
      'Nothing saved yet',
    );
  });

  it('set the ones taken from the logo apart, below a line that says so', async () => {
    mount();
    const sheet = await openPresets();
    expect(within(sheet).getByRole('separator', { name: 'Inspired by the logo' })).toBeVisible();
    const fromLogo = within(sheet).getByRole('list', { name: 'Inspired by the logo' });
    const names = within(fromLogo)
      .getAllByRole('button', { name: /^Apply / })
      .map((b) => b.getAttribute('aria-label'));
    expect(names).toEqual(['Apply Logo', 'Apply Logo Mist', 'Apply Head Seat']);

    await userEvent.click(within(fromLogo).getByRole('button', { name: 'Apply Logo' }));
    expect(store.getState().edits.light['token:rt-secondary-wash']?.base).toEqual({
      kind: 'custom',
      hex: '#8ca4ac',
    });
    expect(store.getState().preset).toMatchObject({ id: 'logo', name: 'Logo', kind: 'builtin' });
  });

  it('show each palette in its light and its dark theme', async () => {
    mount();
    const sheet = await openPresets();
    const lavender = card(sheet, 'Lavender Haze');
    const strips = lavender.querySelectorAll('.cl-preset-strip');
    expect(strips).toHaveLength(2);
    expect(strips[0]?.getAttribute('data-scheme')).toBe('light');
    expect(strips[1]?.getAttribute('data-scheme')).toBe('dark');
    expect(strips[0]?.querySelectorAll('span')).toHaveLength(6);
  });

  it('apply a palette to both themes at once, and say which it is', async () => {
    mount();
    const sheet = await openPresets();
    await userEvent.click(within(sheet).getByRole('button', { name: 'Apply Lavender Haze' }));
    const { edits, preset } = store.getState();
    expect(edits.light['token:rt-secondary']?.base?.kind).toBe('custom');
    expect(edits.dark['token:rt-ink']?.roles?.fill).toMatchObject({ wash: { upTo: 0.22 } });
    expect(preset).toMatchObject({ id: 'lavender-haze', name: 'Lavender Haze', kind: 'builtin' });
    expect(card(sheet, 'Lavender Haze')).toHaveTextContent('Applied');
    expect(screen.getByText(/Lavender Haze applied/)).toBeInTheDocument();
  });

  it('say when the colours have been changed since', async () => {
    mount();
    const sheet = await openPresets();
    await userEvent.click(within(sheet).getByRole('button', { name: 'Apply Peach Sorbet' }));
    store.setSpec('light', 'token:rt-ink', custom('#123456'));
    await waitFor(() =>
      expect(card(sheet, 'Peach Sorbet')).toHaveTextContent('Applied · changed since'),
    );
  });

  it('go back to the app as it is', async () => {
    mount();
    const sheet = await openPresets();
    await userEvent.click(within(sheet).getByRole('button', { name: 'Apply Sage Garden' }));
    await userEvent.click(within(sheet).getByRole('button', { name: 'Apply RoundTable' }));
    expect(store.getState().edits).toEqual({ light: {}, dark: {} });
  });

  it('ask before replacing colours that are not saved anywhere', async () => {
    store.setSpec('light', 'token:rt-ink', custom('#123456'));
    mount();
    const sheet = await openPresets();
    await userEvent.click(within(sheet).getByRole('button', { name: 'Apply Macaron' }));
    expect(within(sheet).getByRole('alert')).toHaveTextContent(/not saved as a preset/);
    await userEvent.click(within(sheet).getByRole('button', { name: 'Cancel' }));
    expect(store.getState().edits.light['token:rt-ink']).toEqual({ base: custom('#123456') });

    await userEvent.click(within(sheet).getByRole('button', { name: 'Apply Macaron' }));
    await userEvent.click(within(sheet).getByRole('button', { name: 'Replace' }));
    expect(store.getState().preset?.id).toBe('macaron');
  });

  it('do not ask when the colours are another preset', async () => {
    mount();
    const sheet = await openPresets();
    await userEvent.click(within(sheet).getByRole('button', { name: 'Apply Powder Blue' }));
    await userEvent.click(within(sheet).getByRole('button', { name: 'Apply Sherbet Pop' }));
    expect(within(sheet).queryByRole('alert')).not.toBeInTheDocument();
    expect(store.getState().preset?.id).toBe('sherbet-pop');
  });
});

describe('your own presets', () => {
  it('are saved from the colours as they are, and named', async () => {
    store.setSpec('light', 'token:rt-ink', custom('#123456'));
    mount();
    const sheet = await openPresets();
    await userEvent.type(
      within(sheet).getByRole('textbox', { name: 'Name for this preset' }),
      'Midnight ink',
    );
    await userEvent.click(within(sheet).getByRole('button', { name: 'Save' }));
    expect(presets.getPresets().map((p) => p.name)).toEqual(['Midnight ink']);
    const yours = within(sheet).getByRole('region', { name: 'Yours' });
    expect(within(yours).getByText('Midnight ink')).toBeInTheDocument();
    expect(card(sheet, 'Midnight ink')).toHaveTextContent('Applied');
    expect(document.querySelector('.cl-preset-bar b')?.textContent).toBe('Midnight ink');
  });

  it('cannot be saved from no colours at all', async () => {
    mount();
    const sheet = await openPresets();
    expect(within(sheet).getByRole('button', { name: 'Save' })).toBeDisabled();
  });

  it('can be applied, renamed and deleted', async () => {
    presets.save('Mine', { light: { 'token:rt-ink': { base: custom('#123456') } }, dark: {} });
    mount();
    const sheet = await openPresets();
    await userEvent.click(within(sheet).getByRole('button', { name: 'Apply Mine' }));
    expect(store.getState().edits.light['token:rt-ink']).toEqual({ base: custom('#123456') });

    await userEvent.click(within(sheet).getByRole('button', { name: 'Rename Mine' }));
    const field = within(sheet).getByRole('textbox', { name: 'Rename Mine' });
    await userEvent.clear(field);
    await userEvent.type(field, 'Ours{Enter}');
    expect(presets.getPresets()[0]?.name).toBe('Ours');
    expect(store.getState().preset?.name).toBe('Ours');

    await userEvent.click(within(sheet).getByRole('button', { name: 'Delete Ours' }));
    expect(presets.getPresets()).toHaveLength(1);
    await userEvent.click(within(sheet).getByRole('button', { name: 'Delete Ours?' }));
    expect(presets.getPresets()).toHaveLength(0);
    expect(store.getState().preset).toBeNull();
  });

  it('keep changes made after applying one, when asked', async () => {
    presets.save('Mine', { light: { 'token:rt-ink': { base: custom('#123456') } }, dark: {} });
    mount();
    const sheet = await openPresets();
    await userEvent.click(within(sheet).getByRole('button', { name: 'Apply Mine' }));
    store.setSpec('light', 'token:rt-ink', custom('#654321'));
    await userEvent.click(await within(sheet).findByRole('button', { name: 'Save changes' }));
    expect(presets.getPresets()[0]?.edits.light['token:rt-ink']).toEqual({
      base: custom('#654321'),
    });
    expect(card(sheet, 'Mine')).not.toHaveTextContent('changed since');
  });

  it('are downloaded as a file a teammate can load', async () => {
    presets.save('Team pick', { light: { 'token:rt-ink': { base: custom('#123456') } }, dark: {} });
    mount();
    const sheet = await openPresets();
    await userEvent.click(within(sheet).getByRole('button', { name: 'Download Team pick' }));
    expect(downloads[0]?.name).toBe('roundtable-palette-team-pick.json');
    const data = JSON.parse(await downloads[0]!.blob.text()) as { format: string; edits: unknown };
    expect(data.format).toBe(STATE_FORMAT);
    expect(data.edits).toEqual({
      light: { 'token:rt-ink': { base: custom('#123456') } },
      dark: {},
    });
  });

  it('are added from such a file', async () => {
    mount();
    const sheet = await openPresets();
    const file = new File(
      [
        JSON.stringify({
          format: STATE_FORMAT,
          version: 1,
          generatedAt: '',
          git: {},
          edits: { light: { 'token:rt-ink': { base: custom('#abcdef') } }, dark: {} },
        }),
      ],
      'roundtable-palette-from-sam.json',
      { type: 'application/json' },
    );
    await userEvent.upload(sheet.querySelector('input[type="file"]') as HTMLInputElement, file);
    await waitFor(() => expect(presets.getPresets().map((p) => p.name)).toEqual(['from-sam']));
    expect(within(sheet).getByRole('status')).toHaveTextContent('Added from-sam');
  });
});
