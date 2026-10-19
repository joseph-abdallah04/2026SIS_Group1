import { Check, FileText, Flag, Lightbulb, RotateCcw, type LucideIcon } from 'lucide-react';

import type { SessionTemplate, SessionTemplateIcon, SessionTemplateTone } from '../templates';
import { formatTimer } from './setupSummary';

const ICONS: Record<SessionTemplateIcon, LucideIcon> = {
  blank: FileText,
  sprint: Flag,
  retro: RotateCcw,
  ideas: Lightbulb,
};

/** Each tone as the icon tile's wash and ink. */
const TONES: Record<SessionTemplateTone, string> = {
  neutral: 'bg-[#eef0f2] text-rt-ink-muted',
  cool: 'bg-rt-cool-tint text-rt-cool-deep',
  plum: 'bg-[#f1eaf4] text-[#7a5c8a]',
  amber: 'bg-[#fbefd6] text-[#9a6a1c]',
};

/** A template's picture on its tone, as a small rounded tile. */
export function TemplateIcon({
  template,
  size = 16,
  className = 'size-[30px] rounded-[9px]',
}: {
  template: SessionTemplate;
  size?: number;
  className?: string;
}) {
  const Icon = ICONS[template.icon];
  return (
    <span
      aria-hidden
      className={`flex shrink-0 items-center justify-center ${TONES[template.tone]} ${className}`}
    >
      <Icon size={size} />
    </span>
  );
}

function meta(template: SessionTemplate): string {
  const count = template.questions.length;
  if (count === 0) return 'Your own questions';
  const talks = template.discussionTimerSeconds
    ? `${formatTimer(template.discussionTimerSeconds)} talks`
    : 'no timers';
  return `${count} questions · ${talks}`;
}

interface TemplateCardsProps {
  templates: readonly SessionTemplate[];
  /** The template the form was last filled from. */
  selectedId: string | null;
  onPick: (template: SessionTemplate) => void;
}

/**
 * T1: every template as a card, always in view, so what is on offer is seen
 * rather than hunted for. One click fills the whole form; the card it came
 * from keeps its tick. On a phone the row scrolls sideways.
 */
export function TemplateCards({ templates, selectedId, onPick }: TemplateCardsProps) {
  return (
    <div
      role="group"
      aria-label="Start from a template"
      className="-mx-4 flex snap-x snap-mandatory gap-2.5 overflow-x-auto px-4 pb-1 sm:mx-0 sm:grid sm:grid-cols-4 sm:overflow-visible sm:px-0 sm:pb-0"
    >
      {templates.map((template) => {
        const selected = template.id === selectedId;
        return (
          <button
            key={template.id}
            type="button"
            aria-pressed={selected}
            aria-label={template.name}
            aria-description={template.summary}
            onClick={() => onPick(template)}
            className={`relative flex min-w-0 shrink-0 basis-[62%] snap-start flex-col gap-1.5 rounded-[14px] border bg-white p-3 text-left transition-[transform,box-shadow,border-color] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] hover:-translate-y-0.5 hover:shadow-[0_10px_22px_rgba(122,106,76,0.13)] focus-visible:ring-2 focus-visible:ring-rt-secondary focus-visible:outline-none motion-reduce:transition-none motion-reduce:hover:translate-y-0 sm:basis-auto ${
              selected
                ? 'border-rt-secondary shadow-[0_0_0_3px_rgba(224,163,60,0.28)]'
                : 'border-[#e8dfcf]'
            }`}
          >
            <TemplateIcon template={template} />
            <span className="text-[13px] font-semibold text-rt-ink">{template.name}</span>
            <span aria-hidden className="text-[11.5px] leading-snug text-rt-ink-muted">
              {template.summary}
            </span>
            <span aria-hidden className="mt-auto pt-0.5 text-[10.5px] text-rt-ink-faint">
              {meta(template)}
            </span>
            {selected ? (
              <span
                aria-hidden
                className="absolute top-2.5 right-2.5 flex size-[18px] items-center justify-center rounded-full bg-rt-secondary text-white"
              >
                <Check size={11} strokeWidth={3} />
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
