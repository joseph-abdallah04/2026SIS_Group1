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
            // Stays where it is under the pointer: only its edge darkens. The
            // one picked is filled in the accent's wash, as a chosen chip is.
            className={`relative flex min-w-0 shrink-0 basis-[62%] cursor-pointer snap-start flex-col gap-1.5 rounded-2xl border p-4 text-left transition-colors focus-visible:ring-2 focus-visible:ring-rt-secondary focus-visible:outline-none sm:basis-auto ${
              selected
                ? 'border-rt-secondary bg-rt-secondary-wash'
                : 'border-rt-tertiary/70 bg-white hover:border-rt-ink-faint'
            }`}
          >
            <TemplateIcon template={template} size={17} className="mb-1 size-9 rounded-[10px]" />
            <span className="text-[14px] font-semibold text-rt-ink">{template.name}</span>
            <span aria-hidden className="text-[12.5px] leading-snug text-rt-ink-muted">
              {template.summary}
            </span>
            <span aria-hidden className="mt-auto pt-1.5 text-[11.5px] text-rt-ink-faint">
              {meta(template)}
            </span>
            {selected ? (
              <span
                aria-hidden
                className="absolute top-3 right-3 flex size-5 items-center justify-center rounded-full bg-rt-secondary text-white"
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
