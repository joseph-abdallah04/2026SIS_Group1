import { Info } from 'lucide-react';
import { useId, useState } from 'react';

interface InfoTipProps {
  /** Names the button: "About the discussion timer". */
  label: string;
  /** The explanation, a sentence or two. */
  text: string;
}

/**
 * An ⓘ that explains a field on hover or focus, so the page can keep a single
 * short hint per field and still say everything. Unlike `Tooltip`, which
 * labels an icon in a few words, this wraps, and is the button's description
 * for a screen reader.
 */
export function InfoTip({ label, text }: InfoTipProps) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <span
      className="relative inline-flex"
      onPointerEnter={() => setOpen(true)}
      onPointerLeave={() => setOpen(false)}
    >
      <button
        type="button"
        aria-label={label}
        aria-describedby={id}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        className="flex rounded-full text-[#b5ad9f] hover:text-rt-secondary-deep focus-visible:ring-2 focus-visible:ring-rt-secondary focus-visible:outline-none"
      >
        <Info aria-hidden size={13} />
      </button>
      <span
        id={id}
        role="tooltip"
        className={`pointer-events-none absolute bottom-full left-1/2 z-30 mb-1.5 w-60 -translate-x-1/2 rounded-md bg-rt-ink px-2.5 py-1.5 text-[11px] leading-snug font-medium text-white shadow-lg ${
          open ? '' : 'hidden'
        }`}
      >
        {text}
      </span>
    </span>
  );
}
