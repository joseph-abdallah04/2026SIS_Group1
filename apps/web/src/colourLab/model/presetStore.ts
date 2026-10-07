import { type Scheme, type SchemeEdits } from './spec';
import { parseStored } from './store';

/** Presets someone saved: their own colours, kept on this device apart from the lab's state. */
export const PRESETS_KEY = 'rt_colour_lab:presets:v1';

export interface SavedPreset {
  id: string;
  name: string;
  /** ISO time it was saved, or last overwritten. */
  savedAt: string;
  edits: Record<Scheme, SchemeEdits>;
}

/** The same edits written the same way, whatever order they were made in, for telling two sets apart. */
export function fingerprintOf(edits: Readonly<Record<Scheme, SchemeEdits>>): string {
  const sort = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(sort);
    if (value && typeof value === 'object') {
      return Object.fromEntries(
        Object.keys(value as object)
          .sort()
          .map((key) => [key, sort((value as Record<string, unknown>)[key])]),
      );
    }
    return value;
  };
  return JSON.stringify(sort({ light: edits.light, dark: edits.dark }));
}

/** Edits read the way the lab reads its own storage, so nothing it does not understand gets in. */
const cleanEdits = (edits: unknown): Record<Scheme, SchemeEdits> =>
  parseStored(JSON.stringify({ edits })).edits;

function readPresets(raw: string | null): SavedPreset[] {
  if (!raw) return [];
  try {
    const data = JSON.parse(raw) as unknown;
    if (!Array.isArray(data)) return [];
    const out: SavedPreset[] = [];
    for (const item of data as Record<string, unknown>[]) {
      if (typeof item?.id !== 'string' || typeof item.name !== 'string') continue;
      out.push({
        id: item.id,
        name: item.name,
        savedAt: typeof item.savedAt === 'string' ? item.savedAt : new Date(0).toISOString(),
        edits: cleanEdits(item.edits),
      });
    }
    return out;
  } catch {
    return [];
  }
}

function browserStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

let counter = 0;
const newId = (): string => `saved-${Date.now().toString(36)}-${(counter++).toString(36)}`;

/**
 * The presets someone saved, newest first. A small external store like the lab's own, saved as it
 * changes, and picked up from another tab when that tab changes it.
 */
export class PresetStore {
  private presets: SavedPreset[];
  private readonly listeners = new Set<() => void>();

  constructor(private readonly storage: Storage | null = browserStorage()) {
    this.presets = readPresets(this.read());
  }

  getPresets = (): readonly SavedPreset[] => this.presets;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  /** Saves colours under a name. Returns the new preset. */
  save(name: string, edits: Record<Scheme, SchemeEdits>, now = new Date()): SavedPreset {
    const preset: SavedPreset = {
      id: newId(),
      name: name.trim() || 'My colours',
      savedAt: now.toISOString(),
      edits: cleanEdits(edits),
    };
    this.commit([preset, ...this.presets]);
    return preset;
  }

  rename(id: string, name: string): void {
    const trimmed = name.trim();
    if (!trimmed) return;
    this.commit(this.presets.map((p) => (p.id === id ? { ...p, name: trimmed } : p)));
  }

  /** Puts these colours in place of what a preset held. */
  overwrite(id: string, edits: Record<Scheme, SchemeEdits>, now = new Date()): void {
    this.commit(
      this.presets.map((p) =>
        p.id === id ? { ...p, edits: cleanEdits(edits), savedAt: now.toISOString() } : p,
      ),
    );
  }

  remove(id: string): void {
    this.commit(this.presets.filter((p) => p.id !== id));
  }

  /** Pick up what another tab saved. */
  sync(): void {
    this.presets = readPresets(this.read());
    for (const listener of this.listeners) listener();
  }

  private read(): string | null {
    try {
      return this.storage?.getItem(PRESETS_KEY) ?? null;
    } catch {
      return null;
    }
  }

  private commit(next: SavedPreset[]): void {
    this.presets = next;
    try {
      this.storage?.setItem(PRESETS_KEY, JSON.stringify(next));
    } catch {
      // Storage full or blocked: the presets last for this visit.
    }
    for (const listener of this.listeners) listener();
  }
}
