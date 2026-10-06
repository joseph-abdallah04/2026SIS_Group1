import { type Role } from '../catalogue/types';
import { type Rgb } from '../colour/convert';
import { formatCss, parseColour, toHex } from '../colour/parse';
import { computeUsage, elementsUsing } from '../detect/usage';
import { islandOf } from '../model/islands';
import {
  type ResolveInput,
  computeDefaultLinks,
  originalOf,
  resolveSlot,
  sameColour,
} from '../model/resolve';
import { type SlotKey, slotKeyForVar, slotKind, varNameForSlot } from '../model/slots';
import { type LabStore } from '../model/store';
import { type StyleWriter, type Use, scanStyleSheets } from './cssom';
import { COLOUR_ATTRIBUTES, DomEngine } from './dom';
import { ImageEngine, type ValueFn } from './images';
import { type Painter, type Template, type VarUse, templateVars, varNameFor } from './template';
import { VarSheet, renderSheet } from './varSheet';

/** What the page has told the engine, for the views to be built from. */
export interface EngineSnapshot {
  version: number;
  /** The authored value of every var slot, in the order the stylesheet declares them. */
  originals: ReadonlyMap<SlotKey, Rgb>;
  defaultLinks: ReadonlyMap<SlotKey, SlotKey>;
  /** Hardcoded colours seen on the page itself, as opposed to in the source. */
  liveHex: ReadonlySet<SlotKey>;
  /** How many places on the current page use each slot. Empty until the first check. */
  usage: ReadonlyMap<SlotKey, number>;
  /** Whether usage has been worked out for the page as it is now. */
  usageKnown: boolean;
  /** The roles each slot is used in, as far as the stylesheets, elements and images say. */
  roleUse: ReadonlyMap<SlotKey, ReadonlySet<Role>>;
}

/** The two themes' worth of settings the engine paints from. */
export interface Inputs {
  current: ResolveInput;
  light: ResolveInput;
}

const differs = (a: Rgb | null, b: Rgb | null): boolean =>
  a !== null && b !== null && !sameColour(a, b);

/**
 * Repaints the page with the colours the lab has been given.
 *
 * The app's colours reach the screen three ways, and each has its own route:
 *   - stylesheet rules and the elements' own inline styles and SVG attributes
 *     are rewritten to read a variable of the lab's, with the app's own colour
 *     as the fallback. The variables are set in one stylesheet, so choosing a
 *     colour changes that and nothing else, and a part of the page that should
 *     stay as it was has only to say so;
 *   - the brand tokens and Tailwind palette are CSS variables already, set in
 *     the same stylesheet;
 *   - SVGs shown as pictures cannot read the page's variables at all, so the
 *     file is rewritten and the picture given the result.
 *
 * Every rewrite remembers the original, so nothing is ever lost, and putting
 * things back is the same code with nothing to change.
 */
export class ColourEngine {
  private readonly originals = new Map<SlotKey, Rgb>();
  private readonly defaultLinks = new Map<SlotKey, SlotKey>();
  private readonly liveHex = new Set<SlotKey>();
  private catalogueHex: ReadonlySet<SlotKey> = new Set();

  private cssWriters: StyleWriter[] = [];
  private writersBySlot = new Map<SlotKey, StyleWriter[]>();
  private cssUses: Use[] = [];

  /** Every variable something on the page can read, whether or not it is being used now. */
  private readonly registry = new Map<string, VarUse>();
  private readonly roleUse = new Map<SlotKey, Set<Role>>();
  /** Per variable: is it being read? Also the cache for asking. */
  private reads = new Map<string, boolean>();
  /** Per variable: what the stylesheet says it is, root and islands, to tell when a value moved. */
  private values = new Map<string, string>();

  private inputs: Inputs;
  private lastEdits: unknown = null;
  private lastLight: unknown = null;
  private lastScheme: unknown = null;

  private usage: ReadonlyMap<SlotKey, number> = new Map();
  private usageKnown = false;
  private usageWanted = false;
  private usageRun = 0;

  private version = 0;
  private snapshot: EngineSnapshot | null = null;
  private readonly listeners = new Set<() => void>();

  private readonly varSheet: VarSheet;
  private readonly dom: DomEngine;
  private readonly images: ImageEngine;
  private readonly observers: MutationObserver[] = [];
  private readonly timers = new Map<string, number>();
  private unsubscribe: (() => void) | null = null;
  private started = false;
  private refreshQueued = false;

  /** The painter every writer asks. Answers from the latest state. */
  private readonly painter: Painter = {
    reads: (slot, role, alpha) => this.readsFor({ slot, role, alpha }),
  };

  constructor(
    private readonly store: LabStore,
    private readonly doc: Document = document,
    /** Nodes the engine must leave alone, such as the lab's own host. */
    private readonly ignore: (node: Node) => boolean = () => false,
  ) {
    this.varSheet = new VarSheet(doc);
    this.dom = new DomEngine((template) => this.noteTemplate(template));
    this.images = new ImageEngine(
      (image) => this.valueFor(image),
      (template) => this.noteTemplate(template),
    );
    this.inputs = this.buildInputs();
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = (): EngineSnapshot => {
    this.snapshot ??= {
      version: this.version,
      originals: this.originals,
      defaultLinks: this.defaultLinks,
      liveHex: this.liveHex,
      usage: this.usage,
      usageKnown: this.usageKnown,
      roleUse: this.roleUse,
    };
    return this.snapshot;
  };

  start(): void {
    if (this.started) return;
    this.started = true;
    this.rescanStyles();
    this.dom.scan(this.doc.documentElement, this.painter);
    this.images.scan(this.doc.documentElement);
    this.refresh(true);

    this.unsubscribe = this.store.subscribe(() => this.refresh());

    const head = new MutationObserver((records) => {
      if (records.some((record) => !this.varSheet.owns(record.target))) {
        this.later('styles', 120, () => this.rescanStyles());
      }
    });
    head.observe(this.doc.head, { childList: true, subtree: true, characterData: true });

    const page = new MutationObserver((records) => this.onPageMutations(records));
    page.observe(this.doc.documentElement, { subtree: true, childList: true, attributes: true });
    this.observers.push(head, page);
  }

  /** Put the page back as the app has it and stop watching it. */
  dispose(): void {
    for (const observer of this.observers) observer.disconnect();
    this.observers.length = 0;
    for (const timer of this.timers.values()) window.clearTimeout(timer);
    this.timers.clear();
    this.unsubscribe?.();
    const off: Painter = { reads: () => false };
    const everything = new Set([...this.liveHex, ...this.originals.keys()]);
    for (const writer of this.cssWriters) writer.apply(off);
    this.dom.reapply(off, everything);
    this.images.reapply(everything);
    this.varSheet.dispose();
    this.started = false;
  }

  /** The hardcoded colours in the source, which the page may not be showing yet. */
  setCatalogueSlots(slots: ReadonlySet<SlotKey>): void {
    this.catalogueHex = slots;
    this.recomputeLinks();
    this.refresh(true);
    this.bump();
  }

  /** Whether anyone is looking at the list: checking the page costs something, so only then. */
  setUsageWanted(wanted: boolean): void {
    if (wanted === this.usageWanted) return;
    this.usageWanted = wanted;
    if (wanted) void this.refreshUsage();
  }

  /** The elements a colour is painted on, to outline them. */
  locate(slot: SlotKey): Element[] {
    const extra = [...this.dom.elementsFor(slot, 80), ...this.images.elementsFor(slot, 80)];
    return elementsUsing(slot, this.cssUses, extra);
  }

  /** What an element of the page is painted with, for the inspector to name. */
  paintOf(element: Element): { uses: Use[]; templates: Template[] } {
    const uses = this.cssUses.filter((use) => {
      if (use.selector === null) return false;
      try {
        return element.matches(use.selector);
      } catch {
        return false;
      }
    });
    return { uses, templates: this.dom.templatesOf(element) };
  }

  /** The colour a slot is in a role right now, for an element: inside content that stays light, in the light theme. */
  colourOn(element: Element | null, slot: SlotKey, role: Role, alpha = 1): Rgb | null {
    const input = element && islandOf(element) ? this.inputs.light : this.inputs.current;
    return resolveSlot(slot, role, input, alpha);
  }

  getInputs(): Inputs {
    return this.inputs;
  }

  // ---- What to paint ----------------------------------------------------

  private buildInputs(): Inputs {
    const state = this.store.getState();
    return {
      current: {
        scheme: state.scheme,
        originals: this.originals,
        defaultLinks: this.defaultLinks,
        edits: state.edits[state.scheme],
      },
      light: {
        scheme: 'light',
        originals: this.originals,
        defaultLinks: this.defaultLinks,
        edits: state.edits.light,
      },
    };
  }

  /**
   * Whether a colour has to be set by the lab's stylesheet at all. A declaration
   * is left as the app wrote it when it would come out the same: for a brand
   * token, when its role is what the root variable already says.
   */
  private needs(
    use: VarUse | { slot: SlotKey; role: Role; alpha: number },
    input: ResolveInput,
  ): boolean {
    const rgb = resolveSlot(use.slot, use.role, input, use.alpha);
    if (!rgb) return false;
    if (slotKind(use.slot) === 'hex') return differs(rgb, originalOf(use.slot, input));
    return differs(rgb, resolveSlot(use.slot, 'other', input, 1));
  }

  /**
   * In the dark theme a colour is also read when only the light theme changes it,
   * so that content which stays light can be given the light colour.
   */
  private computeReads(use: { slot: SlotKey; role: Role; alpha: number }): boolean {
    return (
      this.needs(use, this.inputs.current) ||
      (this.inputs.current.scheme === 'dark' && this.needs(use, this.inputs.light))
    );
  }

  private readsFor(use: { slot: SlotKey; role: Role; alpha: number }): boolean {
    const name = varNameFor(use.role, use.slot, use.alpha);
    let reads = this.reads.get(name);
    if (reads === undefined) {
      reads = this.computeReads(use);
      this.reads.set(name, reads);
    }
    return reads;
  }

  /** Which colours an image gets. Inside content that stays light, the light theme's. */
  private valueFor(image: HTMLImageElement): ValueFn {
    const input = islandOf(image) ? this.inputs.light : this.inputs.current;
    return (slot, role, alpha) => {
      const rgb = resolveSlot(slot, role, input, alpha);
      const original = originalOf(slot, input);
      return differs(rgb, original) ? rgb : null;
    };
  }

  /** Writes what the store says into the page, for whatever has changed since last time. */
  private refresh(force = false): void {
    const state = this.store.getState();
    const edits = state.edits[state.scheme];
    if (
      !force &&
      edits === this.lastEdits &&
      state.edits.light === this.lastLight &&
      state.scheme === this.lastScheme
    ) {
      return;
    }
    this.lastEdits = edits;
    this.lastLight = state.edits.light;
    this.lastScheme = state.scheme;
    this.inputs = this.buildInputs();
    const { current, light } = this.inputs;
    const dark = current.scheme === 'dark';

    const root = new Map<string, string>();
    const islands = new Map<string, string>();

    // The brand tokens and palette: one variable each, for the colour overall.
    for (const slot of this.originals.keys()) {
      const name = varNameForSlot(slot);
      if (!name) continue;
      const now = resolveSlot(slot, 'other', current);
      const inLight = resolveSlot(slot, 'other', light);
      const original = originalOf(slot, current);
      if (differs(now, original) || (dark && differs(inLight, original))) {
        if (now) root.set(name, toHex(now));
        if (inLight) islands.set(name, toHex(inLight));
      }
    }

    // The lab's own variables, for each colour in each role that is to be read.
    const reads = new Map<string, boolean>();
    for (const use of this.registry.values()) {
      const reading = this.computeReads(use);
      reads.set(use.name, reading);
      if (!reading) continue;
      const hex = slotKind(use.slot) === 'hex';
      const now = resolveSlot(use.slot, use.role, current, use.alpha);
      if (now) root.set(use.name, formatCss(now, hex ? use.alpha : 1));
      if (dark) {
        const inLight = this.needs(use, light)
          ? resolveSlot(use.slot, use.role, light, use.alpha)
          : null;
        islands.set(use.name, inLight ? formatCss(inLight, hex ? use.alpha : 1) : 'initial');
      }
    }

    // Which slots changed in whether they are read, and in what they say.
    const readsDirty = new Set<SlotKey>();
    const valueDirty = new Set<SlotKey>();
    const values = new Map<string, string>();
    for (const use of this.registry.values()) {
      const was = this.reads.get(use.name) ?? false;
      const is = reads.get(use.name) ?? false;
      const text = `${root.get(use.name) ?? ''}|${islands.get(use.name) ?? ''}`;
      values.set(use.name, text);
      if (was !== is) readsDirty.add(use.slot);
      if (was !== is || text !== (this.values.get(use.name) ?? '|')) valueDirty.add(use.slot);
    }
    this.reads = reads;
    this.values = values;

    this.varSheet.set(
      renderSheet({ scheme: current.scheme, root, islands: dark ? islands : null }),
    );

    const writers = new Set<StyleWriter>();
    for (const slot of readsDirty) {
      for (const writer of this.writersBySlot.get(slot) ?? []) writers.add(writer);
    }
    for (const writer of writers) writer.apply(this.painter);
    this.dom.reapply(this.painter, readsDirty);
    this.images.reapply(valueDirty);
  }

  // ---- What the page has ------------------------------------------------

  /** Reads the stylesheets afresh. Called at the start, and whenever one changes. */
  private rescanStyles(): void {
    // Put every declaration back first, so the scan reads the app's own values
    // and not ours.
    const off: Painter = { reads: () => false };
    for (const writer of this.cssWriters) writer.apply(off);

    const scan = scanStyleSheets(this.doc);
    this.cssWriters = scan.writers;
    this.cssUses = scan.uses;
    this.writersBySlot = new Map();
    for (const writer of scan.writers) {
      for (const slot of writer.template.slots) {
        const list = this.writersBySlot.get(slot) ?? [];
        list.push(writer);
        this.writersBySlot.set(slot, list);
      }
      this.register(writer.template);
    }

    this.originals.clear();
    for (const [name, value] of scan.varDefs) {
      const slot = slotKeyForVar(name);
      const colour = slot ? parseColour(value) : null;
      if (slot && colour) this.originals.set(slot, colour.rgba);
    }

    this.recomputeLinks();
    this.reads = new Map();
    this.refresh(true);
    this.bump();
    this.scheduleUsage(300);
  }

  /** Takes in a template's variables and slots. Returns whether anything was new. */
  private register(template: Template): boolean {
    let added = false;
    for (const slot of template.slots) {
      if (slotKind(slot) === 'hex' && !this.liveHex.has(slot)) {
        this.liveHex.add(slot);
        added = true;
      }
    }
    for (const use of templateVars(template)) {
      if (this.registry.has(use.name)) continue;
      this.registry.set(use.name, use);
      const roles = this.roleUse.get(use.slot) ?? new Set<Role>();
      roles.add(use.role);
      this.roleUse.set(use.slot, roles);
      added = true;
    }
    return added;
  }

  /** A template from an element or an image the page showed after the scan. */
  private noteTemplate(template: Template): void {
    if (!this.register(template)) return;
    this.recomputeLinks();
    // The variables it reads need values in the stylesheet before the next paint.
    if (this.refreshQueued) return;
    this.refreshQueued = true;
    queueMicrotask(() => {
      this.refreshQueued = false;
      this.refresh(true);
      this.later('views', 120, () => this.bump());
    });
  }

  private recomputeLinks(): void {
    const next = computeDefaultLinks(
      this.originals,
      new Set([...this.liveHex, ...this.catalogueHex]),
    );
    this.defaultLinks.clear();
    for (const [slot, target] of next) this.defaultLinks.set(slot, target);
  }

  private onPageMutations(records: MutationRecord[]): void {
    let changed = false;
    for (const record of records) {
      if (record.type === 'childList') {
        changed = true;
        for (const node of Array.from(record.addedNodes)) {
          if (node instanceof Element && !this.ignore(node)) this.readTree(node);
        }
      } else if (record.target instanceof Element && !this.ignore(record.target)) {
        changed = true;
        const name = record.attributeName;
        if (name && COLOUR_ATTRIBUTES.has(name)) this.dom.track(record.target, this.painter);
        else if (name === 'src' && record.target instanceof HTMLImageElement) {
          this.images.track(record.target);
        }
      }
    }
    if (changed) this.scheduleUsage(600);
  }

  private readTree(root: Element): void {
    this.dom.scan(root, this.painter);
    this.images.scan(root);
  }

  /**
   * Checks the page soon, if anyone is looking. Not restarted by a change that
   * lands while one is waiting: a page that never stops changing, as the
   * landing page does, would otherwise never be checked at all.
   */
  private scheduleUsage(ms: number): void {
    if (!this.usageWanted || this.timers.has('usage')) return;
    this.timers.set(
      'usage',
      window.setTimeout(() => {
        this.timers.delete('usage');
        void this.refreshUsage();
      }, ms),
    );
  }

  private async refreshUsage(): Promise<void> {
    const run = ++this.usageRun;
    const counts = await computeUsage(
      this.cssUses,
      [this.dom.counts(), this.images.counts()],
      () => run === this.usageRun,
    );
    if (!counts) return;
    this.usage = counts;
    this.usageKnown = true;
    this.bump();
  }

  private later(key: string, ms: number, fn: () => void): void {
    const existing = this.timers.get(key);
    if (existing !== undefined) window.clearTimeout(existing);
    this.timers.set(
      key,
      window.setTimeout(() => {
        this.timers.delete(key);
        fn();
      }, ms),
    );
  }

  private bump(): void {
    this.version++;
    this.snapshot = null;
    for (const listener of this.listeners) listener();
  }
}
