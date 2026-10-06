import {
  ChevronDown,
  ChevronRight,
  Crosshair,
  FileText,
  Minus,
  Moon,
  Palette,
  RotateCcw,
  Search,
  Sun,
} from 'lucide-react';
import { type ReactNode, type RefObject, useCallback, useMemo, useState } from 'react';

import { type Scheme } from '../model/resolve';
import { type SlotKey } from '../model/slots';
import { type Filter, type LabStore } from '../model/store';
import { GROUP_TITLES, type Group, type SlotView, filterViews } from '../model/views';
import { SlotRow } from './SlotRow';
import { useFloating } from './useFloating';

const PANEL_WIDTH = 360;
const PILL_WIDTH = 150;

// Module-level so the hook sees the same functions every render.
const panelWidth = () => PANEL_WIDTH;
const pillWidth = () => PILL_WIDTH;
const panelHome = () => ({ x: window.innerWidth - PANEL_WIDTH - 16, y: 72 });
const pillHome = () => ({ x: window.innerWidth - PILL_WIDTH - 16, y: 72 });

const TABS: { id: Filter; label: string }[] = [
  { id: 'page', label: 'This page' },
  { id: 'changed', label: 'Changed' },
  { id: 'all', label: 'All' },
];

interface PanelProps {
  store: LabStore;
  panelRef: RefObject<HTMLDivElement>;
  views: readonly SlotView[];
  usageKnown: boolean;
  filter: Filter;
  search: string;
  scheme: Scheme;
  saved: { x: number | null; y: number | null };
  pickerKey: SlotKey | null;
  onSwatch: (key: SlotKey, anchor: DOMRect) => void;
  onHover: (key: SlotKey | null) => void;
  onDragStart: () => void;
  /** Whether an element is being chosen on the page. */
  picking: boolean;
  onTogglePick: () => void;
  /** What paints the chosen element. Shown in place of the list. */
  inspector: ReactNode;
  /** The prompt being made, shown in place of everything else. */
  sheet: ReactNode;
  /** Which prompt's sheet is open, if one is. */
  sheetKind: Scheme | null;
  /** How many colours have been changed in each theme, shown on the buttons that make the prompts. */
  editCounts: Record<Scheme, number>;
  onPrompt: (kind: Scheme) => void;
}

export function Panel({
  store,
  panelRef,
  views,
  usageKnown,
  filter,
  search,
  scheme,
  saved,
  pickerKey,
  onSwatch,
  onHover,
  onDragStart,
  picking,
  onTogglePick,
  inspector,
  sheet,
  sheetKind,
  editCounts,
  onPrompt,
}: PanelProps) {
  const [detailsKey, setDetailsKey] = useState<SlotKey | null>(null);
  const [collapsed, setCollapsed] = useState<ReadonlySet<Group>>(new Set());

  const floating = useFloating({
    saved: saved.x !== null && saved.y !== null ? { x: saved.x, y: saved.y } : null,
    home: panelHome,
    width: panelWidth,
    onCommit: (point) => store.setUi(point),
    onDragStart,
    ignore: 'button, input',
  });

  const listing = useMemo(
    () => filterViews(views, filter, search, usageKnown),
    [views, filter, search, usageKnown],
  );
  const changedKeys = useMemo(
    () => new Set(views.filter((view) => view.changed).map((view) => view.key)),
    [views],
  );
  const changed = changedKeys.size;
  const hasEdits = views.some((view) => view.own !== null);

  const counts: Record<Filter, number | null> = {
    page: usageKnown ? views.filter((view) => view.onPage).length : null,
    changed: views.filter((view) => view.changed || view.own !== null).length,
    all: views.length,
  };

  const groups = useMemo(() => {
    const out: { group: Group; views: SlotView[] }[] = [];
    for (const view of listing.views) {
      const last = out[out.length - 1];
      if (last && last.group === view.group) last.views.push(view);
      else out.push({ group: view.group, views: [view] });
    }
    return out;
  }, [listing.views]);

  const toggleGroup = useCallback((group: Group) => {
    setCollapsed((current) => {
      const next = new Set(current);
      if (!next.delete(group)) next.add(group);
      return next;
    });
  }, []);

  const empty =
    filter === 'changed' && search === ''
      ? 'Nothing changed yet. Click a swatch to try a colour.'
      : filter === 'page' && search === '' && usageKnown
        ? 'No colours detected on this page yet. Try All.'
        : 'No colours match.';

  return (
    <div
      ref={panelRef}
      className="cl-panel"
      role="region"
      aria-label="Colour Lab"
      style={{
        left: floating.point.x,
        top: floating.point.y,
        maxHeight: `calc(100vh - ${floating.point.y}px - 8px)`,
      }}
    >
      <header className="cl-header" data-dragging={floating.dragging} {...floating.bind}>
        <Palette size={15} aria-hidden />
        <span className="cl-title">Colour Lab</span>
        {changed > 0 && (
          <span className="cl-count" title={`${changed} changed in the ${scheme} theme`}>
            {changed}
          </span>
        )}
        <span className="cl-spacer" />
        <div className="cl-scheme" role="group" aria-label="Theme">
          <button
            aria-pressed={scheme === 'light'}
            title="Show the app as it is"
            onClick={() => store.setScheme('light')}
          >
            <Sun size={13} aria-hidden />
            Light
          </button>
          <button
            aria-pressed={scheme === 'dark'}
            title="Show the app in the dark theme being tried"
            onClick={() => store.setScheme('dark')}
          >
            <Moon size={13} aria-hidden />
            Dark
          </button>
        </div>
        <button
          className="cl-icon-button"
          aria-label="Reset every colour"
          title={`Reset every colour in the ${scheme} theme`}
          disabled={!hasEdits}
          onClick={() => store.resetAll(scheme)}
        >
          <RotateCcw size={14} />
        </button>
        <button
          className="cl-icon-button"
          aria-label="Minimise"
          title="Minimise"
          onClick={() => store.setUi({ minimised: true })}
        >
          <Minus size={15} />
        </button>
      </header>

      <div className="cl-toolbar" hidden={inspector !== null || sheet !== null}>
        <div className="cl-toolbar-row">
          <label className="cl-search">
            <Search size={14} aria-hidden />
            <input
              value={search}
              placeholder="Search name, hex or file"
              spellCheck={false}
              onChange={(event) => store.setUi({ search: event.target.value })}
            />
          </label>
          <button
            className="cl-pick-button"
            aria-pressed={picking}
            title="Pick from page: click anything to see what paints it"
            onClick={onTogglePick}
          >
            <Crosshair size={14} aria-hidden />
            Pick
          </button>
        </div>
        <div className="cl-tabs" role="tablist" aria-label="Which colours to show">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              className="cl-tab"
              role="tab"
              aria-selected={filter === tab.id}
              onClick={() => store.setUi({ filter: tab.id })}
            >
              {tab.label}
              {counts[tab.id] !== null && <small>{counts[tab.id]}</small>}
            </button>
          ))}
        </div>
      </div>

      {sheet !== null && <div className="cl-list">{sheet}</div>}
      {sheet === null && inspector !== null && <div className="cl-list">{inspector}</div>}
      <div className="cl-list" hidden={inspector !== null || sheet !== null}>
        {listing.pending && <p className="cl-note">Checking which colours this page uses…</p>}
        {groups.length === 0 && !listing.pending && <p className="cl-empty">{empty}</p>}
        {groups.map(({ group, views: rows }) => (
          <section key={group}>
            <button
              className="cl-group"
              aria-expanded={!collapsed.has(group)}
              onClick={() => toggleGroup(group)}
            >
              {collapsed.has(group) ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
              {GROUP_TITLES[group]}
              <span>{rows.length}</span>
            </button>
            {!collapsed.has(group) &&
              rows.map((view) => (
                <SlotRow
                  key={view.key}
                  view={view}
                  scheme={scheme}
                  pickerOpen={pickerKey === view.key}
                  detailsOpen={detailsKey === view.key}
                  followedIsChanged={view.link ? changedKeys.has(view.link.target) : false}
                  onSwatch={onSwatch}
                  onToggleDetails={(key) => setDetailsKey((open) => (open === key ? null : key))}
                  onHover={onHover}
                />
              ))}
          </section>
        ))}
      </div>

      <footer className="cl-footer">
        <div className="cl-prompts" role="group" aria-label="Make a prompt">
          {(['light', 'dark'] as const).map((kind) => (
            <button
              key={kind}
              className="cl-prompt-button"
              aria-pressed={sheetKind === kind}
              title={`A text file for Claude on main that makes the ${kind} theme what is shown here`}
              onClick={() => onPrompt(kind)}
            >
              <FileText size={13} aria-hidden />
              Create {kind} prompt
              {editCounts[kind] > 0 && <small>{editCounts[kind]}</small>}
            </button>
          ))}
        </div>
        <div className="cl-status">
          <span>{listing.views.length} shown</span>
          <b title={window.location.pathname}>{window.location.pathname}</b>
        </div>
      </footer>
    </div>
  );
}

interface PillProps {
  store: LabStore;
  changed: number;
  saved: { x: number | null; y: number | null };
}

/** The lab folded away: still draggable, one click to open. */
export function Pill({ store, changed, saved }: PillProps) {
  const floating = useFloating({
    saved: saved.x !== null && saved.y !== null ? { x: saved.x, y: saved.y } : null,
    home: pillHome,
    width: pillWidth,
    onCommit: (point) => store.setUi(point),
    onTap: () => store.setUi({ minimised: false }),
  });
  return (
    <div
      className="cl-pill"
      role="button"
      tabIndex={0}
      aria-label="Open Colour Lab"
      title="Open Colour Lab (drag to move)"
      style={{ left: floating.point.x, top: floating.point.y }}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') store.setUi({ minimised: false });
      }}
      {...floating.bind}
    >
      <Palette size={15} aria-hidden />
      Colour Lab
      {changed > 0 && <span className="cl-count">{changed}</span>}
    </div>
  );
}
