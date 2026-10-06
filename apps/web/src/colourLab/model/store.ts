import { parseHex } from '../colour/parse';
import { ROLE_KEYS, type RoleKey } from './roles';
import { type Scheme, type SchemeEdits, type SlotEdit, type Spec } from './spec';
import { type SlotKey } from './slots';

export type Filter = 'page' | 'changed' | 'all';

export interface UiState {
  /** Top-left of the panel or the pill. `null` until it has been placed. */
  x: number | null;
  y: number | null;
  minimised: boolean;
  filter: Filter;
  search: string;
}

export interface LabState {
  scheme: Scheme;
  /** Only what the user changed. Defaults are worked out, never stored. */
  edits: Record<Scheme, SchemeEdits>;
  ui: UiState;
}

export const STORAGE_KEY = 'rt_colour_lab:v2';
/** The first version saved a slot's edit as a bare spec, with no roles. */
const LEGACY_STORAGE_KEY = 'rt_colour_lab:v1';

const EMPTY_UI: UiState = { x: null, y: null, minimised: false, filter: 'page', search: '' };

export const emptyState = (): LabState => ({
  scheme: 'light',
  edits: { light: {}, dark: {} },
  ui: { ...EMPTY_UI },
});

function readSpec(value: unknown): Spec | null {
  if (typeof value !== 'object' || value === null) return null;
  const spec = value as Record<string, unknown>;
  if (spec.kind === 'original') return { kind: 'original' };
  if (spec.kind === 'custom' && typeof spec.hex === 'string' && parseHex(spec.hex)) {
    return { kind: 'custom', hex: spec.hex.toLowerCase() };
  }
  if (spec.kind === 'link' && typeof spec.slot === 'string')
    return { kind: 'link', slot: spec.slot };
  return null;
}

function readEdit(value: unknown): SlotEdit | null {
  if (typeof value !== 'object' || value === null) return null;
  // A bare spec, as the first version saved it.
  const bare = readSpec(value);
  if (bare) return { base: bare };

  const raw = value as { base?: unknown; roles?: unknown };
  const edit: SlotEdit = {};
  const base = readSpec(raw.base);
  if (base) edit.base = base;
  if (typeof raw.roles === 'object' && raw.roles !== null) {
    const roles: Partial<Record<RoleKey, Spec>> = {};
    for (const role of ROLE_KEYS) {
      const spec = readSpec((raw.roles as Record<string, unknown>)[role]);
      if (spec) roles[role] = spec;
    }
    if (Object.keys(roles).length > 0) edit.roles = roles;
  }
  return edit.base || edit.roles ? edit : null;
}

function readEdits(value: unknown): SchemeEdits {
  const out: Record<SlotKey, SlotEdit> = {};
  if (typeof value !== 'object' || value === null) return out;
  for (const [slot, raw] of Object.entries(value)) {
    const edit = readEdit(raw);
    if (edit) out[slot] = edit;
  }
  return out;
}

/** What was saved, or a fresh state for anything that does not look like it. */
export function parseStored(raw: string | null): LabState {
  const fresh = emptyState();
  if (!raw) return fresh;
  try {
    const data = JSON.parse(raw) as Record<string, unknown>;
    const edits = (data.edits ?? {}) as Record<string, unknown>;
    const ui = (data.ui ?? {}) as Record<string, unknown>;
    const filter = ui.filter;
    return {
      scheme: data.scheme === 'dark' ? 'dark' : 'light',
      edits: { light: readEdits(edits.light), dark: readEdits(edits.dark) },
      ui: {
        x: typeof ui.x === 'number' ? ui.x : null,
        y: typeof ui.y === 'number' ? ui.y : null,
        minimised: ui.minimised === true,
        filter: filter === 'changed' || filter === 'all' ? filter : 'page',
        search: typeof ui.search === 'string' ? ui.search : '',
      },
    };
  } catch {
    return fresh;
  }
}

function browserStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/** A slot's edit with the empty parts taken out, or `null` if nothing is left of it. */
function tidy(edit: SlotEdit): SlotEdit | null {
  const out: SlotEdit = {};
  if (edit.base) out.base = edit.base;
  if (edit.roles && Object.keys(edit.roles).length > 0) out.roles = edit.roles;
  return out.base || out.roles ? out : null;
}

/**
 * The lab's own state: the edits, which scheme is showing, and where the panel
 * sits. A small external store rather than React state, because the engine
 * that repaints the page reads it too, and it is saved as it changes so a
 * reload, or a hot update, finds the colours as they were left.
 */
export class LabStore {
  private state: LabState;
  private readonly listeners = new Set<() => void>();
  private saveTimer: number | null = null;

  constructor(private readonly storage: Storage | null = browserStorage()) {
    this.state = parseStored(this.read());
  }

  getState = (): LabState => this.state;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  /**
   * Set a slot's spec in one scheme: for the colour overall, or for one role of
   * it. `null` takes it back to the default.
   */
  setSpec(scheme: Scheme, slot: SlotKey, spec: Spec | null, role?: RoleKey): void {
    const edits: Record<SlotKey, SlotEdit> = { ...this.state.edits[scheme] };
    const edit: SlotEdit = { ...edits[slot] };
    if (role) {
      const roles = { ...edit.roles };
      if (spec) roles[role] = spec;
      else delete roles[role];
      edit.roles = roles;
    } else if (spec) edit.base = spec;
    else delete edit.base;

    const kept = tidy(edit);
    if (kept) edits[slot] = kept;
    else delete edits[slot];
    this.commit({ ...this.state, edits: { ...this.state.edits, [scheme]: edits } });
  }

  /** Forget everything set for one slot in one scheme, every role included. */
  clearSlot(scheme: Scheme, slot: SlotKey): void {
    const edits: Record<SlotKey, SlotEdit> = { ...this.state.edits[scheme] };
    delete edits[slot];
    this.commit({ ...this.state, edits: { ...this.state.edits, [scheme]: edits } });
  }

  /** Take another set of edits in place of these, as when colours are loaded from a prompt. */
  replaceEdits(edits: Readonly<Record<Scheme, SchemeEdits>>): void {
    this.commit({ ...this.state, edits: { light: edits.light, dark: edits.dark } });
  }

  /** Drop every edit in a scheme, or in both. */
  resetAll(scheme?: Scheme): void {
    const edits = { ...this.state.edits };
    for (const key of scheme ? [scheme] : (['light', 'dark'] as const)) edits[key] = {};
    this.commit({ ...this.state, edits });
  }

  setScheme(scheme: Scheme): void {
    if (scheme !== this.state.scheme) this.commit({ ...this.state, scheme });
  }

  setUi(patch: Partial<UiState>): void {
    this.commit({ ...this.state, ui: { ...this.state.ui, ...patch } });
  }

  /** Pick up what another tab saved. The panel position stays this tab's own. */
  syncEdits(): void {
    const saved = parseStored(this.read());
    this.commit({ ...this.state, scheme: saved.scheme, edits: saved.edits }, false);
  }

  /** Write now rather than on the timer, for when the page is going away. */
  flush(): void {
    if (this.saveTimer !== null) window.clearTimeout(this.saveTimer);
    this.saveTimer = null;
    try {
      this.storage?.setItem(STORAGE_KEY, JSON.stringify(this.state));
    } catch {
      // Storage full or blocked. The lab still works, it just will not be remembered.
    }
  }

  private read(): string | null {
    try {
      return (
        this.storage?.getItem(STORAGE_KEY) ?? this.storage?.getItem(LEGACY_STORAGE_KEY) ?? null
      );
    } catch {
      return null;
    }
  }

  private commit(next: LabState, persist = true): void {
    this.state = next;
    if (persist && this.saveTimer === null) {
      this.saveTimer = window.setTimeout(() => this.flush(), 150);
    }
    for (const listener of this.listeners) listener();
  }
}
