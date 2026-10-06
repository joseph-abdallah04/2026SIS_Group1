import { Link2, Link2Off, RotateCcw } from 'lucide-react';
import { type CSSProperties, useMemo } from 'react';

import { toHex } from '../colour/parse';
import { relinkSlot, restoreDefault, unlinkSlot } from '../model/actions';
import { type Scheme } from '../model/resolve';
import { ROLE_KEYS, ROLE_LABELS } from '../model/roles';
import { type SlotKey } from '../model/slots';
import { type SlotView } from '../model/views';
import { useLab } from './context';

interface SlotRowProps {
  view: SlotView;
  scheme: Scheme;
  pickerOpen: boolean;
  detailsOpen: boolean;
  /** Whether the slot this one follows has been changed. */
  followedIsChanged: boolean;
  onSwatch: (key: SlotKey, anchor: DOMRect) => void;
  onToggleDetails: (key: SlotKey) => void;
  onHover: (key: SlotKey | null) => void;
}

const basename = (file: string): string => file.slice(file.lastIndexOf('/') + 1);

export function SlotRow({
  view,
  scheme,
  pickerOpen,
  detailsOpen,
  followedIsChanged,
  onSwatch,
  onToggleDetails,
  onHover,
}: SlotRowProps) {
  const { store } = useLab();
  const baseline = toHex(view.baseline);
  const current = toHex(view.current);
  const edited = view.changed || view.own !== null;
  const roles = ROLE_KEYS.flatMap((role) => {
    const colour = view.roles[role];
    return colour ? [{ role, colour }] : [];
  });

  const second =
    view.group === 'hardcoded'
      ? [
          view.exportOnly ? 'recap and exports only' : view.where.join(' · '),
          view.sites > 0 ? `${view.sites} place${view.sites === 1 ? '' : 's'}` : 'seen on the page',
        ]
          .filter(Boolean)
          .join(' · ')
      : view.hint;

  return (
    <>
      <div
        className="cl-row"
        data-open={pickerOpen || detailsOpen}
        onMouseEnter={() => onHover(view.key)}
        onMouseLeave={() => onHover(null)}
      >
        <button
          className="cl-swatch"
          data-changed={view.changed}
          aria-label={`Edit ${view.label}, ${current}`}
          aria-expanded={pickerOpen}
          style={{ '--cl-original': baseline, '--cl-current': current } as CSSProperties}
          onClick={(event) => onSwatch(view.key, event.currentTarget.getBoundingClientRect())}
        />
        <button
          className="cl-text"
          aria-expanded={detailsOpen}
          onClick={() => onToggleDetails(view.key)}
        >
          <span className="cl-name">
            <b title={view.hint || view.key}>{view.label}</b>
            {view.group !== 'hardcoded' && <span className="cl-hex">{current}</span>}
          </span>
          <span className="cl-sub" title={second}>
            {second}
          </span>
        </button>
        <span className="cl-meta">
          {view.split && (
            <span
              className="cl-roles"
              title={roles
                .map(({ role, colour }) => `${ROLE_LABELS[role]} ${toHex(colour.current)}`)
                .join(', ')}
            >
              {roles.map(({ role, colour }) => (
                <i key={role} style={{ background: toHex(colour.current) }} />
              ))}
            </span>
          )}
          {view.onPage && (
            <i
              className="cl-dot"
              title={`On this page${view.pageCount > 1 ? `, ${view.pageCount} places` : ''}`}
            />
          )}
          {view.link && (
            <button
              className="cl-chip"
              data-following={view.link.following}
              title={
                view.link.following
                  ? `Follows ${view.link.label}. Click to stop following it.`
                  : `Not following ${view.link.label}. Click to follow it again.`
              }
              onClick={() =>
                view.link?.following
                  ? unlinkSlot(store, scheme, view)
                  : relinkSlot(store, scheme, view)
              }
            >
              {view.link.following ? <Link2 size={11} /> : <Link2Off size={11} />}
              {view.link.label}
            </button>
          )}
          {edited && (
            <button
              className="cl-icon-button"
              aria-label={`Reset ${view.label}`}
              title={
                scheme === 'dark'
                  ? 'Put the dark palette’s colour back'
                  : 'Put the original colour back'
              }
              onClick={() => restoreDefault(store, scheme, view, followedIsChanged)}
            >
              <RotateCcw size={13} />
            </button>
          )}
        </span>
      </div>
      {detailsOpen && <Details view={view} scheme={scheme} />}
    </>
  );
}

function Details({ view, scheme }: { view: SlotView; scheme: Scheme }) {
  const { catalogue } = useLab();
  const places = useMemo(
    () => catalogue.literals.filter((literal) => literal.slot === view.key).slice(0, 8),
    [catalogue, view.key],
  );
  const token = catalogue.tokens.find((def) => def.slot === view.key);
  const original = toHex(view.original);
  const baseline = toHex(view.baseline);
  const current = toHex(view.current);
  const roles = ROLE_KEYS.flatMap((role) => {
    const colour = view.roles[role];
    return colour ? [{ role, colour }] : [];
  });

  return (
    <div className="cl-details">
      <p>
        {view.changed ? (
          <>
            {scheme === 'dark' ? 'The dark palette has' : 'Was'} {baseline}, now {current}.
          </>
        ) : scheme === 'dark' ? (
          <>
            Dark palette: {baseline}. The app has {original}.
          </>
        ) : (
          <>As the app has it: {original}.</>
        )}{' '}
        {view.onPage
          ? `On this page${view.pageCount > 1 ? ` in ${view.pageCount} places` : ''}.`
          : 'Not on this page.'}
        {view.exportOnly && ' Only used when the recap PDF and previews are drawn.'}
      </p>
      {roles.length > 0 && (
        <p className="cl-role-list">
          {roles.map(({ role, colour }) => (
            <span key={role} data-own={colour.own}>
              <i style={{ background: toHex(colour.current) }} />
              {ROLE_LABELS[role]} {toHex(colour.current)}
              {colour.own ? ' ·set' : ''}
            </span>
          ))}
        </p>
      )}
      {view.link && (
        <p>
          Same value as {view.link.label}
          {view.link.following ? ', so it follows it.' : '. Not following it now.'}
        </p>
      )}
      <ul>
        {token && (
          <li>
            <span>
              {basename(token.file)}:{token.line}
            </span>
            <span>{token.name}</span>
          </li>
        )}
        {places.map((place) => (
          <li key={`${place.file}:${place.line}:${place.col}`}>
            <span>
              {basename(place.file)}:{place.line}
            </span>
            <span title={place.snippet}>
              {place.context} · {place.raw}
            </span>
          </li>
        ))}
        {view.sites > places.length && !token && (
          <li>
            <span>…</span>
            <span>{view.sites - places.length} more</span>
          </li>
        )}
        {view.group !== 'hardcoded' && view.where.length > 0 && (
          <li>
            <span>used in</span>
            <span>{view.where.join(', ')}</span>
          </li>
        )}
      </ul>
    </div>
  );
}
