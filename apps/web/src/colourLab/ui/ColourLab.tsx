import {
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { type Catalogue } from '../catalogue/types';
import { type InspectDeps, type Inspection, inspect, transitionsAround } from '../detect/inspect';
import { type ColourEngine } from '../engine/engine';
import { pickColour, restoreDefault } from '../model/actions';
import { type RoleKey } from '../model/roles';
import { type SlotKey } from '../model/slots';
import { type Scheme } from '../model/spec';
import { PRESETS_KEY, PresetStore, fingerprintOf } from '../model/presetStore';
import { type LabStore } from '../model/store';
import { LabContext, type LabContextValue, useLab, useLabView } from './context';
import { Inspector } from './Inspector';
import { Outlines } from './Outlines';
import { Panel, Pill } from './Panel';
import { buildDarkPrompt } from '../prompt/renderDark';
import { buildLightPrompt, type PromptResult } from '../prompt/renderLight';
import { Picker, type QuickColour } from './Picker';
import { PresetSheet } from './PresetSheet';
import { PromptSheet } from './PromptSheet';
import { PickLayer } from './PickLayer';

export interface CatalogueSource {
  initial: Catalogue;
  /** Calls back with a new catalogue when the source changes. Returns how to stop. */
  watch: (onUpdate: (catalogue: Catalogue) => void) => () => void;
}

interface Props {
  store: LabStore;
  engine: ColourEngine;
  catalogue: CatalogueSource;
  /** Saved presets. Made here when not given. */
  presets?: PresetStore;
}

export function ColourLab({ store, engine, catalogue: source, presets: given }: Props) {
  const [catalogue, setCatalogue] = useState(source.initial);
  const [presets] = useState(() => given ?? new PresetStore());

  // Presets saved in another tab show up here too.
  useEffect(() => {
    const onStorage = (event: StorageEvent): void => {
      if (event.key === PRESETS_KEY) presets.sync();
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [presets]);
  useEffect(() => source.watch(setCatalogue), [source]);

  // The hardcoded colours in the source are known to the engine as well as the
  // page, so a copy of a token is linked to it before it has been drawn.
  useEffect(() => {
    engine.setCatalogueSlots(new Set(catalogue.literals.map((literal) => literal.slot)));
  }, [engine, catalogue]);

  const context = useMemo<LabContextValue>(
    () => ({ store, engine, catalogue, presets }),
    [store, engine, catalogue, presets],
  );

  return (
    <LabContext.Provider value={context}>
      <Shell />
    </LabContext.Provider>
  );
}

interface PickerState {
  key: SlotKey;
  anchor: DOMRect;
  role?: RoleKey;
}

function Shell() {
  const { store, engine, catalogue, presets } = useLab();
  const { state, views, snapshot } = useLabView();
  const { ui, scheme } = state;

  const [picker, setPicker] = useState<PickerState | null>(null);
  const [hovered, setHovered] = useState<SlotKey | null>(null);
  const [picking, setPicking] = useState(false);
  const [pointed, setPointed] = useState<Element | null>(null);
  const [inspected, setInspected] = useState<Element | null>(null);
  const [inherited, setInherited] = useState<Element | null>(null);
  const [settled, setSettled] = useState(0);
  const [sheetKind, setSheetKind] = useState<Scheme | 'presets' | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // Checking the page costs a little, so it is only done while the list is showing.
  useEffect(() => {
    engine.setUsageWanted(!ui.minimised);
  }, [engine, ui.minimised]);

  useEffect(() => {
    if (ui.minimised) {
      setPicker(null);
      setPicking(false);
    }
  }, [ui.minimised]);

  // Elements are looked up when hovering starts, not each render.
  const located = useMemo(
    () => (hovered ? engine.locate(hovered) : []),
    [engine, hovered, snapshot],
  );

  const byKey = useMemo(() => new Map(views.map((view) => [view.key, view])), [views]);
  const pickerView = picker ? byKey.get(picker.key) : undefined;
  const quick = useMemo<QuickColour[]>(
    () =>
      views
        .filter((view) => view.group === 'brand')
        .map((view) => ({ key: view.key, label: view.label, rgb: view.current })),
    [views],
  );
  const changedKeys = useMemo(
    () => new Set(views.filter((view) => view.changed).map((view) => view.key)),
    [views],
  );

  // What paints the chosen element, worked out again as colours change under it. While a
  // colour is still easing to its new value the browser reports one part-way, which no slot
  // matches, so the last settled reading is kept until the transition ends.
  const settledRef = useRef<Inspection | null>(null);
  const reading = useMemo(() => {
    if (!inspected?.isConnected) return { inspection: null, running: [] as Animation[] };
    const deps: InspectDeps = {
      paintOf: (element) => engine.paintOf(element),
      colourOn: (element, slot, role, alpha) => engine.colourOn(element, slot, role, alpha),
      canvas: () => (scheme === 'dark' ? { r: 18, g: 18, b: 18 } : { r: 255, g: 255, b: 255 }),
      style: (element) => getComputedStyle(element),
    };
    const fresh = inspect(inspected, deps);
    const running = transitionsAround(inspected);
    const held = running.length > 0 && settledRef.current?.element === inspected;
    return { inspection: held ? settledRef.current : fresh, running };
    // The page repaints when the state changes, so the inspection has to be made again.
  }, [engine, inspected, scheme, state, snapshot, settled]);
  const inspection = reading.inspection;

  useEffect(() => {
    if (reading.running.length === 0) {
      settledRef.current = reading.inspection;
      return undefined;
    }
    let live = true;
    void Promise.allSettled(reading.running.map((animation) => animation.finished)).then(() => {
      if (live) setSettled((count) => count + 1);
    });
    return () => {
      live = false;
    };
  }, [reading]);

  // Hover changes what an element is painted with, `group-hover` on a parent included, and
  // nothing tells the lab when the pointer moves on or off, so the element and what holds it
  // are listened to. The listeners are on the elements, which the event shield leaves alone.
  useEffect(() => {
    if (!inspected) return undefined;
    const again = (): void => setSettled((count) => count + 1);
    const chain: Element[] = [];
    for (let node: Element | null = inspected; node; node = node.parentElement) chain.push(node);
    for (const node of chain) {
      node.addEventListener('pointerenter', again);
      node.addEventListener('pointerleave', again);
    }
    return () => {
      for (const node of chain) {
        node.removeEventListener('pointerenter', again);
        node.removeEventListener('pointerleave', again);
      }
    };
  }, [inspected]);

  // The prompt is made only while its sheet is open, and again as the colours change under it.
  const prompt = useMemo<PromptResult | null>(() => {
    if (!sheetKind || sheetKind === 'presets' || ui.minimised) return null;
    const inputs = {
      catalogue,
      originals: snapshot.originals,
      defaultLinks: snapshot.defaultLinks,
      edits: state.edits,
      generatedAt: new Date(),
    };
    return sheetKind === 'light' ? buildLightPrompt(inputs) : buildDarkPrompt(inputs);
  }, [catalogue, sheetKind, snapshot.originals, snapshot.defaultLinks, state.edits, ui.minimised]);

  const editCounts = useMemo(
    () => ({
      light: Object.keys(state.edits.light).length,
      dark: Object.keys(state.edits.dark).length,
    }),
    [state.edits],
  );

  const presetContext = useMemo(
    () => ({ catalogue, originals: snapshot.originals, defaultLinks: snapshot.defaultLinks }),
    [catalogue, snapshot.originals, snapshot.defaultLinks],
  );
  const presetBar = useMemo(
    () =>
      state.preset
        ? {
            name: state.preset.name,
            changed: state.preset.fingerprint !== fingerprintOf(state.edits),
          }
        : null,
    [state.preset, state.edits],
  );

  const openPrompt = useCallback((kind: Scheme | 'presets') => {
    setSheetKind((open) => (open === kind ? null : kind));
    setPicker(null);
    setPicking(false);
    setInspected(null);
    setInherited(null);
  }, []);

  const openPicker = useCallback((key: SlotKey, anchor: DOMRect, role?: RoleKey) => {
    setPicker((open) => (open?.key === key && open.role === role ? null : { key, anchor, role }));
  }, []);

  // A press inside the lab but outside the picker closes it. The swatch that
  // opened it is left to toggle it itself.
  const onPointerDown = (event: ReactPointerEvent<HTMLElement>): void => {
    if (!picker || !(event.target instanceof Element)) return;
    if (event.target.closest('.cl-picker, .cl-swatch')) return;
    setPicker(null);
  };

  const changed = changedKeys.size;

  return (
    <div
      onPointerDown={onPointerDown}
      onKeyDown={(event) => {
        if (event.key !== 'Escape') return;
        if (picker) setPicker(null);
        else if (sheetKind) setSheetKind(null);
      }}
    >
      {/* First, so the panel is drawn over them and not they over it. */}
      <Outlines elements={located} />
      <Outlines elements={inherited ? [inherited] : []} />
      <Outlines elements={inspected && !picking ? [inspected] : []} kind="inspect" />
      <Outlines elements={picking && pointed ? [pointed] : []} kind="pick" />
      {picking && (
        <PickLayer
          onHover={setPointed}
          onPick={(element) => {
            setInspected(element);
            setPicking(false);
            setPointed(null);
            setPicker(null);
          }}
          onCancel={() => {
            setPicking(false);
            setPointed(null);
          }}
        />
      )}
      {ui.minimised ? (
        <Pill store={store} changed={changed} saved={ui} />
      ) : (
        <Panel
          store={store}
          panelRef={panelRef}
          views={views}
          usageKnown={snapshot.usageKnown}
          filter={ui.filter}
          search={ui.search}
          scheme={scheme}
          saved={ui}
          pickerKey={picker?.key ?? null}
          onSwatch={(key, anchor) => openPicker(key, anchor)}
          onHover={setHovered}
          onDragStart={() => setPicker(null)}
          picking={picking}
          onTogglePick={() => {
            setSheetKind(null);
            setPicking((on) => !on);
          }}
          sheet={
            sheetKind === 'presets' && !ui.minimised ? (
              <PresetSheet
                store={store}
                presets={presets}
                context={presetContext}
                edits={state.edits}
                applied={state.preset}
                onClose={() => setSheetKind(null)}
              />
            ) : prompt ? (
              <PromptSheet
                key={prompt.kind}
                result={prompt}
                hasEdits={editCounts.light + editCounts.dark > 0}
                onClose={() => setSheetKind(null)}
                onLoad={(edits) => {
                  store.replaceEdits(edits);
                  setSheetKind(null);
                }}
              />
            ) : null
          }
          sheetKind={sheetKind}
          editCounts={editCounts}
          onPrompt={openPrompt}
          preset={presetBar}
          onPresets={() => openPrompt('presets')}
          inspector={
            inspection ? (
              <Inspector
                inspection={inspection}
                views={byKey}
                onEdit={(slot, role, anchor) => openPicker(slot, anchor, role)}
                onBack={() => {
                  setInspected(null);
                  setPicker(null);
                }}
                onPickAgain={() => setPicking(true)}
                onHover={setInherited}
              />
            ) : null
          }
        />
      )}
      {picker && pickerView && !ui.minimised && (
        <Picker
          key={`${picker.key}|${picker.role ?? ''}`}
          view={pickerView}
          scheme={scheme}
          quick={quick}
          initialRole={picker.role}
          anchor={picker.anchor}
          panel={panelRef.current?.getBoundingClientRect() ?? null}
          onChange={(rgb, role) => pickColour(store, scheme, pickerView, rgb, role)}
          onReset={(role) =>
            restoreDefault(
              store,
              scheme,
              pickerView,
              pickerView.link ? changedKeys.has(pickerView.link.target) : false,
              role,
            )
          }
          onClose={() => setPicker(null)}
        />
      )}
    </div>
  );
}
