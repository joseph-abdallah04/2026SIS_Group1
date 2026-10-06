import { Check, Copy, Pipette, X } from 'lucide-react';
import {
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';

import { type Rgb, hsvToRgb, rgbToHsv, round8 } from '../colour/convert';
import { parseHex, toHex } from '../colour/parse';
import { type Scheme, sameColour } from '../model/resolve';
import { ROLE_KEYS, ROLE_LABELS, type RoleKey } from '../model/roles';
import { packRgb } from '../model/slots';
import { type SlotView } from '../model/views';
import { MARGIN } from './useFloating';

export interface QuickColour {
  key: string;
  label: string;
  rgb: Rgb;
}

interface Hsv {
  h: number;
  s: number;
  v: number;
}

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

/** A grey has no hue of its own, so keep the one it had, or the hue slider jumps to red. */
function keepHue(next: Hsv, previous: Hsv): Hsv {
  return next.s < 0.01 || next.v < 0.01 ? { ...next, h: previous.h } : next;
}

const HEX_INPUT = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i;

/** Pointer position within an element, 0 to 1 on each axis, while it is held. */
function useArea(onPoint: (x: number, y: number) => void) {
  const held = useRef(false);
  const read = (event: ReactPointerEvent<HTMLElement>): void => {
    const box = event.currentTarget.getBoundingClientRect();
    onPoint(
      clamp01((event.clientX - box.left) / box.width),
      clamp01((event.clientY - box.top) / box.height),
    );
  };
  return {
    onPointerDown: (event: ReactPointerEvent<HTMLElement>) => {
      event.currentTarget.setPointerCapture(event.pointerId);
      held.current = true;
      read(event);
    },
    onPointerMove: (event: ReactPointerEvent<HTMLElement>) => {
      if (held.current) read(event);
    },
    onPointerUp: () => {
      held.current = false;
    },
    onPointerCancel: () => {
      held.current = false;
    },
  };
}

/** Which colour the picker is editing: the colour overall, or one role of it. */
type Target = RoleKey | 'all';

interface PickerProps {
  view: SlotView;
  scheme: Scheme;
  quick: readonly QuickColour[];
  /** The role to open on, as when it was picked from an element's text or border. */
  initialRole?: RoleKey;
  /** Where the row's swatch is, and where the panel is, to sit beside them. */
  anchor: DOMRect;
  panel: DOMRect | null;
  onChange: (rgb: Rgb, role: RoleKey | undefined) => void;
  onReset: (role: RoleKey | undefined) => void;
  onClose: () => void;
}

/**
 * A colour picker that applies as it moves. The page repaints with every drag
 * of the square, so the colour is judged where it is used and not in a swatch.
 *
 * A colour used in more than one way, text and a background say, can be set for
 * each way apart: gold that is bright enough to read as text is too bright to
 * carry light text on. "All" is the colour wherever it has no setting of its own.
 */
export function Picker({
  view,
  scheme,
  quick,
  initialRole,
  anchor,
  panel,
  onChange,
  onReset,
  onClose,
}: PickerProps) {
  const roles = ROLE_KEYS.filter((role) => view.roles[role]);
  const [target, setTarget] = useState<Target>(
    initialRole && view.roles[initialRole] ? initialRole : 'all',
  );
  const role = target === 'all' ? undefined : target;
  const shown = role ? (view.roles[role]?.current ?? view.current) : view.current;
  const defaultColour = role ? (view.roles[role]?.baseline ?? view.baseline) : view.baseline;
  const roleOwn = role ? (view.roles[role]?.own ?? false) : false;

  const [hsv, setHsv] = useState<Hsv>(() => rgbToHsv(shown));
  const rgb = hsvToRgb(hsv.h, hsv.s, hsv.v);
  const hex = toHex(rgb);
  const [hexDraft, setHexDraft] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // What was last sent up, so the colour coming back down is recognised as ours.
  const sent = useRef(packRgb(shown));
  const pending = useRef<{ rgb: Rgb; role: RoleKey | undefined } | null>(null);
  const frame = useRef(0);
  const latestOnChange = useRef(onChange);
  latestOnChange.current = onChange;

  const flush = (): void => {
    if (frame.current) cancelAnimationFrame(frame.current);
    frame.current = 0;
    const out = pending.current;
    pending.current = null;
    if (out) latestOnChange.current(out.rgb, out.role);
  };

  const emit = (next: Rgb): void => {
    sent.current = packRgb(next);
    pending.current = { rgb: next, role };
    if (frame.current) return;
    frame.current = requestAnimationFrame(flush);
  };

  // Only on leaving: the latest colour is sent, and a drag cut short is not lost.
  useEffect(() => flush, []);

  // A reset, or the colour changing some other way, brings the picker along.
  const incoming = packRgb(shown);
  useEffect(() => {
    if (incoming === sent.current) return;
    sent.current = incoming;
    setHsv((previous) => keepHue(rgbToHsv(shown), previous));
    // `shown` is a new object each render; its value is what `incoming` says.
  }, [incoming]);

  const switchTo = (next: Target): void => {
    flush();
    setTarget(next);
    const nextShown = next === 'all' ? view.current : (view.roles[next]?.current ?? view.current);
    sent.current = packRgb(nextShown);
    setHsv((previous) => keepHue(rgbToHsv(nextShown), previous));
    setHexDraft(null);
  };

  const setFromHsv = (next: Hsv): void => {
    setHsv(next);
    emit(hsvToRgb(next.h, next.s, next.v));
  };
  const setFromRgb = (next: Rgb): void => {
    const clean = { r: round8(next.r), g: round8(next.g), b: round8(next.b) };
    setHsv((previous) => keepHue(rgbToHsv(clean), previous));
    emit(clean);
  };

  const square = useArea((x, y) => setFromHsv({ h: hsv.h, s: x, v: 1 - y }));
  const hue = useArea((x) => setFromHsv({ ...hsv, h: x * 360 }));

  // Beside the panel when there is room, over it otherwise, and always on screen.
  const box = useRef<HTMLDivElement>(null);
  const [place, setPlace] = useState({ left: MARGIN, top: MARGIN });
  useLayoutEffect(() => {
    const height = box.current?.offsetHeight ?? 420;
    const width = 262;
    const gap = 10;
    let left = panel ? panel.left - gap - width : window.innerWidth - width - MARGIN;
    if (panel && left < MARGIN) {
      left = panel.right + gap;
      if (left + width > window.innerWidth - MARGIN) left = Math.max(MARGIN, panel.left + 12);
    }
    const wanted = anchor.top + anchor.height / 2 - 60;
    const top = Math.min(
      Math.max(MARGIN, wanted),
      Math.max(MARGIN, window.innerHeight - height - MARGIN),
    );
    setPlace({ left, top });
  }, [anchor, panel]);

  const hexValue = hexDraft ?? hex.slice(1);
  const hexValid = hexDraft === null || HEX_INPUT.test(hexDraft);

  const copy = (): void => {
    void navigator.clipboard?.writeText(hex).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    });
  };

  const eyeDropper = typeof window !== 'undefined' && 'EyeDropper' in window;
  const pickFromScreen = async (): Promise<void> => {
    try {
      const Dropper = (
        window as unknown as { EyeDropper: new () => { open(): Promise<{ sRGBHex: string }> } }
      ).EyeDropper;
      const picked = parseHex((await new Dropper().open()).sRGBHex);
      if (picked) setFromRgb(picked.rgba);
    } catch {
      // Cancelled with Escape, or the browser refused.
    }
  };

  const channel = (name: 'r' | 'g' | 'b') => (
    <label className="cl-field">
      {name}
      <input
        type="number"
        min={0}
        max={255}
        inputMode="numeric"
        value={round8(rgb[name])}
        onChange={(event) => {
          const value = parseInt(event.target.value, 10);
          if (!Number.isNaN(value))
            setFromRgb({ ...rgb, [name]: Math.min(255, Math.max(0, value)) });
        }}
      />
    </label>
  );

  const canReset = role
    ? roleOwn || !sameColour(shown, defaultColour)
    : view.changed || view.own !== null;
  const defaultName = scheme === 'dark' ? 'Palette' : 'Original';

  return (
    <div
      ref={box}
      className="cl-picker"
      role="group"
      aria-label={`Edit ${view.label}`}
      style={{ left: place.left, top: place.top }}
    >
      <div className="cl-picker-title">
        <span title={view.hint || view.key}>{view.label}</span>
        <button className="cl-icon-button" aria-label="Copy hex" title="Copy hex" onClick={copy}>
          {copied ? <Check size={14} /> : <Copy size={14} />}
        </button>
        {eyeDropper && (
          <button
            className="cl-icon-button"
            aria-label="Pick a colour from the screen"
            title="Pick from screen"
            onClick={() => void pickFromScreen()}
          >
            <Pipette size={14} />
          </button>
        )}
        <button className="cl-icon-button" aria-label="Close picker" onClick={onClose}>
          <X size={14} />
        </button>
      </div>

      {roles.length > 0 && (
        <div className="cl-role-tabs" role="tablist" aria-label="Where the colour is used">
          <button
            role="tab"
            className="cl-role-tab"
            aria-selected={target === 'all'}
            title="The colour wherever it has no setting of its own"
            onClick={() => switchTo('all')}
          >
            All
          </button>
          {roles.map((key) => (
            <button
              key={key}
              role="tab"
              className="cl-role-tab"
              aria-selected={target === key}
              data-own={view.roles[key]?.own}
              title={`${ROLE_LABELS[key]} only${view.roles[key]?.own ? ' (set apart)' : ''}`}
              onClick={() => switchTo(key)}
            >
              <i style={{ background: toHex(view.roles[key]?.current ?? view.current) }} />
              {ROLE_LABELS[key]}
            </button>
          ))}
        </div>
      )}
      {role && (
        <p className="cl-role-note">
          {roleOwn
            ? `${ROLE_LABELS[role]} has a colour of its own.`
            : `${ROLE_LABELS[role]} follows All. Choose a colour to set it apart.`}
        </p>
      )}

      <div
        className="cl-sv"
        {...square}
        style={{
          background: `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, hsl(${hsv.h} 100% 50%))`,
        }}
      >
        <i
          className="cl-knob"
          style={{ left: `${hsv.s * 100}%`, top: `${(1 - hsv.v) * 100}%`, background: hex }}
        />
      </div>

      <div className="cl-hue" {...hue}>
        <i
          className="cl-knob"
          style={{
            left: `${(hsv.h / 360) * 100}%`,
            top: '50%',
            background: `hsl(${hsv.h} 100% 50%)`,
          }}
        />
      </div>

      <div className="cl-fields">
        <label className="cl-field">
          hex
          <input
            value={hexValue}
            maxLength={7}
            spellCheck={false}
            aria-invalid={!hexValid}
            onFocus={(event) => event.target.select()}
            onChange={(event) => {
              const text = event.target.value;
              setHexDraft(text);
              const match = HEX_INPUT.exec(text);
              const parsed = match ? parseHex(`#${match[1]}`) : null;
              if (parsed) setFromRgb(parsed.rgba);
            }}
            onBlur={() => setHexDraft(null)}
          />
        </label>
        {channel('r')}
        {channel('g')}
        {channel('b')}
      </div>

      <div className="cl-compare">
        <button
          onClick={() => onReset(role)}
          disabled={!canReset}
          title={
            role
              ? `Take ${ROLE_LABELS[role]} back to following All`
              : scheme === 'dark'
                ? 'Put the dark palette’s colour back'
                : 'Put the original colour back'
          }
        >
          <i style={{ background: toHex(defaultColour) } as CSSProperties} />
          <span>
            <small>{role ? 'Follow All' : defaultName}</small>
            {toHex(defaultColour)}
          </span>
        </button>
        <button disabled title="The colour now">
          <i style={{ background: hex } as CSSProperties} />
          <span>
            <small>New</small>
            {hex}
          </span>
        </button>
      </div>

      {quick.length > 0 && (
        <div className="cl-quick">
          <span>Brand colours</span>
          <div>
            {quick.map((colour) => (
              <button
                key={colour.key}
                title={`${colour.label} ${toHex(colour.rgb)}`}
                aria-label={`Use ${colour.label}`}
                style={{ background: toHex(colour.rgb) }}
                onClick={() => setFromRgb(colour.rgb)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
