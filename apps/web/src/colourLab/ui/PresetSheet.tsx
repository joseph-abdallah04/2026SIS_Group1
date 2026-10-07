import { ArrowLeft, Check, Download, FileUp, Pencil, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';

import { type Rgb } from '../colour/convert';
import { toHex } from '../colour/parse';
import { type PresetContext, buildPreset } from '../model/presets/generate';
import { BASELINE_ID, LOGO_PALETTES, PALETTES, type Palette } from '../model/presets/palettes';
import { type PresetStore, type SavedPreset, fingerprintOf } from '../model/presetStore';
import { resolveSlot } from '../model/resolve';
import { type Role } from '../catalogue/types';
import { type Scheme, type SchemeEdits } from '../model/spec';
import { type AppliedPreset, type LabStore } from '../model/store';
import { parseState, stateOf } from '../prompt/state';
import { readText, saveText } from './download';

type Edits = Record<Scheme, SchemeEdits>;

interface PresetSheetProps {
  store: LabStore;
  presets: PresetStore;
  context: PresetContext;
  edits: Edits;
  applied: AppliedPreset | null;
  onClose: () => void;
}

interface Choice {
  id: string;
  name: string;
  mood: string;
  kind: AppliedPreset['kind'];
  edits: Edits;
}

/** What a preview strip shows: the page, a card, the button, a label, the cool accent, and the ink. */
const STRIP: { token: string; role: Role; label: string }[] = [
  { token: 'secondary-wash', role: 'fill', label: 'Page' },
  { token: 'surface', role: 'fill', label: 'Card' },
  { token: 'secondary', role: 'fill', label: 'Button' },
  { token: 'secondary-deep', role: 'text', label: 'Label' },
  { token: 'cool', role: 'fill', label: 'Live' },
  { token: 'ink', role: 'text', label: 'Text' },
];

const choiceOf = (palette: Palette, context: PresetContext): Choice => ({
  id: palette.id,
  name: palette.name,
  mood: palette.mood,
  kind: 'builtin',
  edits: buildPreset(palette, context),
});

const hexOf = (rgb: Rgb | null): string =>
  rgb ? toHex({ r: Math.round(rgb.r), g: Math.round(rgb.g), b: Math.round(rgb.b) }) : 'transparent';

function Strip({
  edits,
  scheme,
  context,
}: {
  edits: Edits;
  scheme: Scheme;
  context: PresetContext;
}) {
  const input = {
    scheme,
    originals: context.originals,
    defaultLinks: context.defaultLinks,
    edits: edits[scheme],
  };
  return (
    <span className="cl-preset-strip" data-scheme={scheme} aria-hidden>
      {STRIP.map(({ token, role, label }) => (
        <span
          key={token}
          title={`${label} (${scheme})`}
          style={{ background: hexOf(resolveSlot(`token:rt-${token}`, role, input)) }}
        />
      ))}
    </span>
  );
}

const fileName = (name: string): string =>
  `roundtable-palette-${
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'mine'
  }.json`;

/**
 * Palettes to try in one click, light and dark together, and the place to keep your own. Applying
 * one replaces the colours in both themes; switch Light and Dark in the header to see each.
 */
export function PresetSheet({
  store,
  presets,
  context,
  edits,
  applied,
  onClose,
}: PresetSheetProps) {
  const saved = useSyncExternalStore(presets.subscribe, presets.getPresets);
  const sheet = useRef<HTMLDivElement>(null);
  const [name, setName] = useState('');
  const [confirming, setConfirming] = useState<Choice | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    sheet.current?.focus({ preventScroll: true });
  }, []);

  const builtIns = useMemo<Choice[]>(
    () => [
      {
        id: BASELINE_ID,
        name: 'RoundTable',
        mood: 'The app as it is today, gold on cream, and the lab’s own dark theme.',
        kind: 'builtin',
        edits: { light: {}, dark: {} },
      },
      ...PALETTES.map((palette) => choiceOf(palette, context)),
    ],
    [context],
  );
  const fromLogo = useMemo<Choice[]>(
    () => LOGO_PALETTES.map((palette) => choiceOf(palette, context)),
    [context],
  );
  const yours = useMemo<Choice[]>(
    () =>
      saved.map((p: SavedPreset) => ({
        id: p.id,
        name: p.name,
        mood: '',
        kind: 'saved',
        edits: p.edits,
      })),
    [saved],
  );

  const current = fingerprintOf(edits);
  const known = useMemo(
    () =>
      new Set([...builtIns, ...fromLogo, ...yours].map((choice) => fingerprintOf(choice.edits))),
    [builtIns, fromLogo, yours],
  );
  const unsaved = current !== fingerprintOf({ light: {}, dark: {} }) && !known.has(current);

  const apply = (choice: Choice): void => {
    const fingerprint = fingerprintOf(choice.edits);
    store.applyPreset(choice.edits, {
      id: choice.id,
      name: choice.name,
      kind: choice.kind,
      fingerprint,
    });
    setConfirming(null);
    setNotice(`${choice.name} applied. Switch Light and Dark above to see both.`);
  };

  const ask = (choice: Choice): void => {
    if (unsaved) setConfirming(choice);
    else apply(choice);
  };

  const saveCurrent = (): void => {
    const preset = presets.save(name, edits);
    store.setPreset({ id: preset.id, name: preset.name, kind: 'saved', fingerprint: current });
    setName('');
    setNotice(`Saved as ${preset.name}.`);
  };

  const importFile = async (file: File | undefined): Promise<void> => {
    if (!file) return;
    const read = parseState(await readText(file));
    if (!read) {
      setNotice('That file has no Colour Lab colours in it.');
      return;
    }
    const preset = presets.save(
      file.name.replace(/\.(json|txt)$/i, '').replace(/^roundtable-palette-/, ''),
      read,
    );
    setNotice(`Added ${preset.name} to your presets.`);
  };

  const status = (choice: Choice): string | null => {
    if (applied?.id !== choice.id) return null;
    return applied.fingerprint === current ? 'Applied' : 'Applied · changed since';
  };

  const card = (choice: Choice) => {
    const label = status(choice);
    const isSaved = choice.kind === 'saved';
    return (
      <li key={choice.id} className="cl-preset" data-applied={label !== null}>
        <div className="cl-preset-head">
          {renaming === choice.id ? (
            <input
              className="cl-preset-rename"
              aria-label={`Rename ${choice.name}`}
              defaultValue={choice.name}
              autoFocus
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  presets.rename(choice.id, event.currentTarget.value);
                  if (applied?.id === choice.id) {
                    store.setPreset({
                      ...applied,
                      name: event.currentTarget.value.trim() || applied.name,
                    });
                  }
                  setRenaming(null);
                } else if (event.key === 'Escape') {
                  event.stopPropagation();
                  setRenaming(null);
                }
              }}
              onBlur={() => setRenaming(null)}
            />
          ) : (
            <b>{choice.name}</b>
          )}
          {label && (
            <span className="cl-preset-badge">
              <Check size={11} aria-hidden />
              {label}
            </span>
          )}
        </div>
        {choice.mood && <p className="cl-preset-mood">{choice.mood}</p>}
        <div className="cl-preset-strips">
          <Strip edits={choice.edits} scheme="light" context={context} />
          <Strip edits={choice.edits} scheme="dark" context={context} />
        </div>
        <div className="cl-preset-actions">
          <button
            className="cl-secondary"
            aria-label={`Apply ${choice.name}`}
            onClick={() => ask(choice)}
          >
            Apply
          </button>
          {isSaved && label === 'Applied · changed since' && (
            <button
              className="cl-secondary"
              onClick={() => {
                presets.overwrite(choice.id, edits);
                store.setPreset({
                  id: choice.id,
                  name: choice.name,
                  kind: 'saved',
                  fingerprint: current,
                });
                setNotice(`${choice.name} now holds the colours as they are.`);
              }}
            >
              Save changes
            </button>
          )}
          {isSaved && (
            <>
              <button
                className="cl-icon-button"
                aria-label={`Rename ${choice.name}`}
                title="Rename"
                onClick={() => setRenaming(choice.id)}
              >
                <Pencil size={13} />
              </button>
              <button
                className="cl-icon-button"
                aria-label={`Download ${choice.name}`}
                title="Download, to share or keep"
                onClick={() =>
                  saveText(
                    JSON.stringify(
                      stateOf(choice.edits, context.catalogue.git, new Date()),
                      null,
                      1,
                    ),
                    fileName(choice.name),
                  )
                }
              >
                <Download size={13} />
              </button>
              {deleting === choice.id ? (
                <button
                  className="cl-secondary cl-danger"
                  onClick={() => {
                    presets.remove(choice.id);
                    if (applied?.id === choice.id) store.setPreset(null);
                    setDeleting(null);
                  }}
                >
                  Delete {choice.name}?
                </button>
              ) : (
                <button
                  className="cl-icon-button"
                  aria-label={`Delete ${choice.name}`}
                  title="Delete"
                  onClick={() => setDeleting(choice.id)}
                >
                  <Trash2 size={13} />
                </button>
              )}
            </>
          )}
        </div>
      </li>
    );
  };

  return (
    <div className="cl-sheet" role="region" aria-label="Presets" tabIndex={-1} ref={sheet}>
      <div className="cl-inspector-head">
        <button
          className="cl-icon-button"
          aria-label="Back to the list"
          title="Back to the list"
          onClick={onClose}
        >
          <ArrowLeft size={15} />
        </button>
        <b className="cl-sheet-title">Presets</b>
      </div>

      {notice && (
        <p className="cl-note" role="status">
          {notice}
        </p>
      )}

      {confirming && (
        <div className="cl-sheet-confirm" role="alert">
          <span>
            Your current colours are not saved as a preset. Replace them with {confirming.name}?
            Save them below first to keep them.
          </span>
          <button className="cl-primary" onClick={() => apply(confirming)}>
            Replace
          </button>
          <button className="cl-secondary" onClick={() => setConfirming(null)}>
            Cancel
          </button>
        </div>
      )}

      <section aria-label="Recommended">
        <h3 className="cl-preset-group">Recommended</h3>
        <ul className="cl-presets">{builtIns.map(card)}</ul>
        <div className="cl-preset-divider" role="separator" aria-label="Inspired by the logo">
          <span>Inspired by the logo</span>
        </div>
        <ul className="cl-presets" aria-label="Inspired by the logo">
          {fromLogo.map(card)}
        </ul>
      </section>

      <section aria-label="Yours">
        <h3 className="cl-preset-group">Yours</h3>
        {yours.length === 0 ? (
          <p className="cl-preset-mood">Nothing saved yet. Save the colours you have now below.</p>
        ) : (
          <ul className="cl-presets">{yours.map(card)}</ul>
        )}
        <form
          className="cl-preset-save"
          onSubmit={(event) => {
            event.preventDefault();
            saveCurrent();
          }}
        >
          <input
            aria-label="Name for this preset"
            placeholder="Name your current colours"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
          <button
            className="cl-primary"
            type="submit"
            disabled={current === fingerprintOf({ light: {}, dark: {} })}
          >
            Save
          </button>
        </form>
        <label className="cl-secondary cl-file">
          <FileUp size={14} aria-hidden />
          Add a preset from a file…
          <input
            type="file"
            accept=".json,.txt,application/json,text/plain"
            onChange={(event) => {
              void importFile(event.target.files?.[0]);
              event.target.value = '';
            }}
          />
        </label>
      </section>
    </div>
  );
}
