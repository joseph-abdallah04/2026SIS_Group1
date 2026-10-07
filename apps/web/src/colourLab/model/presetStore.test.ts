import { describe, expect, it } from 'vitest';

import { PRESETS_KEY, PresetStore, fingerprintOf } from './presetStore';
import { LabStore } from './store';

const custom = (hex: string) => ({ kind: 'custom' as const, hex });
const edits = { light: { 'token:rt-ink': { base: custom('#101828') } }, dark: {} };

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

const storage = () => new MemoryStorage() as unknown as Storage;

describe('PresetStore', () => {
  it('saves colours under a name, newest first, and remembers them', () => {
    const memory = storage();
    const store = new PresetStore(memory);
    const first = store.save('Calm', edits, new Date('2026-10-07T10:00:00Z'));
    const second = store.save('  Bright  ', { light: {}, dark: {} });
    expect(store.getPresets().map((p) => p.name)).toEqual(['Bright', 'Calm']);
    expect(first.savedAt).toBe('2026-10-07T10:00:00.000Z');
    expect(second.id).not.toBe(first.id);
    expect(new PresetStore(memory).getPresets()).toEqual(store.getPresets());
  });

  it('gives a nameless preset a name', () => {
    expect(new PresetStore(storage()).save('   ', edits).name).toBe('My colours');
  });

  it('renames, overwrites and removes', () => {
    const store = new PresetStore(storage());
    const preset = store.save('Calm', edits);
    store.rename(preset.id, 'Calmer');
    store.rename(preset.id, '   ');
    expect(store.getPresets()[0]?.name).toBe('Calmer');
    store.overwrite(preset.id, {
      light: {},
      dark: { 'token:rt-ink': { base: custom('#ffffff') } },
    });
    expect(store.getPresets()[0]?.edits.dark['token:rt-ink']).toEqual({ base: custom('#ffffff') });
    store.remove(preset.id);
    expect(store.getPresets()).toEqual([]);
  });

  it('keeps out what it does not understand', () => {
    const memory = storage();
    memory.setItem(
      PRESETS_KEY,
      JSON.stringify([
        {
          id: 'a',
          name: 'Good',
          edits: { light: { 'token:rt-ink': { base: custom('#123456') } } },
        },
        { name: 'no id' },
        {
          id: 'b',
          name: 'Bad colour',
          edits: { light: { 'token:rt-ink': { base: { kind: 'custom', hex: 'nope' } } } },
        },
      ]),
    );
    const presets = new PresetStore(memory).getPresets();
    expect(presets.map((p) => p.id)).toEqual(['a', 'b']);
    expect(presets[1]?.edits.light).toEqual({});
    memory.setItem(PRESETS_KEY, '{not json');
    expect(new PresetStore(memory).getPresets()).toEqual([]);
  });

  it('picks up what another tab saved', () => {
    const memory = storage();
    const here = new PresetStore(memory);
    const there = new PresetStore(memory);
    let heard = 0;
    here.subscribe(() => heard++);
    there.save('From the other tab', edits);
    here.sync();
    expect(here.getPresets().map((p) => p.name)).toEqual(['From the other tab']);
    expect(heard).toBe(1);
  });
});

describe('fingerprintOf', () => {
  it('is the same for the same colours, whatever order they were set in', () => {
    const a = {
      light: {
        'token:rt-ink': { base: custom('#101828') },
        'tw:white': { base: custom('#ffffff') },
      },
      dark: {},
    };
    const b = {
      dark: {},
      light: {
        'tw:white': { base: custom('#ffffff') },
        'token:rt-ink': { base: custom('#101828') },
      },
    };
    expect(fingerprintOf(a)).toBe(fingerprintOf(b));
    expect(fingerprintOf(a)).not.toBe(fingerprintOf(edits));
  });
});

describe('the lab remembers the preset its colours came from', () => {
  const applied = {
    id: 'lavender-haze',
    name: 'Lavender Haze',
    kind: 'builtin' as const,
    fingerprint: 'x',
  };

  it('across a reload', () => {
    const memory = storage();
    const lab = new LabStore(memory);
    lab.applyPreset(edits, applied);
    lab.flush();
    const again = new LabStore(memory).getState();
    expect(again.preset).toEqual(applied);
    expect(again.edits).toEqual(edits);
  });

  it('forgets it when everything is reset, or colours are loaded from elsewhere', () => {
    const lab = new LabStore(null);
    lab.applyPreset(edits, applied);
    lab.resetAll('light');
    expect(lab.getState().preset).toEqual(applied);
    lab.resetAll();
    expect(lab.getState().preset).toBeNull();
    lab.applyPreset(edits, applied);
    lab.replaceEdits(edits);
    expect(lab.getState().preset).toBeNull();
  });
});
