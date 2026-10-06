import { ArrowLeft, Crosshair } from 'lucide-react';
import { type CSSProperties } from 'react';

import { type Finding, type Inspection } from '../detect/inspect';
import { toHex } from '../colour/parse';
import { ROLE_LABELS, type RoleKey } from '../model/roles';
import { type SlotKey } from '../model/slots';
import { type SlotView } from '../model/views';

const ROLE_ORDER: RoleKey[] = ['text', 'fill', 'border', 'shadow'];

interface InspectorProps {
  inspection: Inspection;
  /** Every slot's row, to name what paints each colour. */
  views: ReadonlyMap<SlotKey, SlotView>;
  onEdit: (slot: SlotKey, role: RoleKey, anchor: DOMRect) => void;
  onBack: () => void;
  onPickAgain: () => void;
  /** Outline an element the inspector names, as the one a colour is inherited from. */
  onHover: (element: Element | null) => void;
}

const VERDICT_NOTE: Record<string, string> = {
  AAA: 'Reads very well',
  AA: 'Reads well',
  'AA large': 'Fine for large text only',
  fail: 'Hard to read',
};

/**
 * What paints one element of the page: its text, background, border and
 * shadow, each traced to the colour of the lab that makes it, and how well its
 * text reads on what is behind it.
 */
export function Inspector({
  inspection,
  views,
  onEdit,
  onBack,
  onPickAgain,
  onHover,
}: InspectorProps) {
  const { contrast, element } = inspection;
  const findings = ROLE_ORDER.flatMap((role) => inspection.findings.filter((f) => f.role === role));

  return (
    <div className="cl-inspector">
      <div className="cl-inspector-head">
        <button
          className="cl-icon-button"
          aria-label="Back to the list"
          title="Back to the list"
          onClick={onBack}
        >
          <ArrowLeft size={15} />
        </button>
        <code title={inspection.label}>{inspection.label}</code>
        <button className="cl-chip" title="Choose another element" onClick={onPickAgain}>
          <Crosshair size={11} />
          Pick again
        </button>
      </div>

      {contrast && (
        <div className="cl-contrast" data-verdict={contrast.verdict}>
          <span
            className="cl-contrast-sample"
            style={{ background: toHex(contrast.background), color: toHex(contrast.foreground) }}
          >
            Aa
          </span>
          <div>
            <b>{contrast.ratio.toFixed(contrast.ratio >= 10 ? 1 : 2)} : 1</b>
            <span className="cl-verdict">
              {contrast.verdict === 'fail' ? 'Fails' : contrast.verdict}
            </span>
            <small>
              {VERDICT_NOTE[contrast.verdict]}. Text on what is behind it
              {contrast.ratio < 4.5 ? ': aim for 4.5 or more for body text' : ''}.
            </small>
          </div>
        </div>
      )}

      {findings.length === 0 && <p className="cl-empty">Nothing is painted on this element.</p>}

      {findings.map((finding) => (
        <FindingRow
          key={finding.role}
          finding={finding}
          element={element}
          views={views}
          onEdit={onEdit}
          onHover={onHover}
        />
      ))}
    </div>
  );
}

function FindingRow({
  finding,
  element,
  views,
  onEdit,
  onHover,
}: {
  finding: Finding;
  element: Element;
  views: ReadonlyMap<SlotKey, SlotView>;
  onEdit: InspectorProps['onEdit'];
  onHover: InspectorProps['onHover'];
}) {
  const hex = toHex(finding.colour);
  const alpha = finding.colour.a < 1 ? ` at ${Math.round(finding.colour.a * 100)}%` : '';
  const traced = finding.slots.flatMap((slot) => {
    const view = views.get(slot);
    return view ? [view] : [];
  });
  const first = traced[0];
  const inherited = finding.from !== element;

  return (
    <div className="cl-finding">
      <button
        className="cl-swatch"
        data-changed="false"
        aria-label={`Edit the ${ROLE_LABELS[finding.role].toLowerCase()} colour ${hex}`}
        disabled={!first}
        style={{ '--cl-original': hex, '--cl-current': hex } as CSSProperties}
        onClick={(event) => {
          if (first) onEdit(first.key, finding.role, event.currentTarget.getBoundingClientRect());
        }}
      />
      <div className="cl-finding-text">
        <span className="cl-name">
          <b>{ROLE_LABELS[finding.role]}</b>
          <span className="cl-hex">
            {hex}
            {alpha}
          </span>
        </span>
        {traced.length > 0 ? (
          <span className="cl-finding-slots">
            {traced.map((view) => (
              <button
                key={view.key}
                className="cl-chip"
                title={`Edit ${view.label} for ${ROLE_LABELS[finding.role].toLowerCase()}`}
                onClick={(event) =>
                  onEdit(view.key, finding.role, event.currentTarget.getBoundingClientRect())
                }
              >
                {view.label}
              </button>
            ))}
          </span>
        ) : (
          <span className="cl-sub">
            Not set by a colour the lab can change: a browser default, or an image.
          </span>
        )}
        {inherited && (
          <span
            className="cl-sub"
            onMouseEnter={() => onHover(finding.from)}
            onMouseLeave={() => onHover(null)}
          >
            Inherited from a parent. Hover to see which.
          </span>
        )}
      </div>
    </div>
  );
}
