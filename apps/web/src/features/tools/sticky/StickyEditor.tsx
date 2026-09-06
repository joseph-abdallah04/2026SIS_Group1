import { useState, type FormEvent, type KeyboardEvent } from 'react';
import { Check, CheckCircle2, LoaderCircle } from 'lucide-react';
import type { StickyColor } from '@roundtable/shared';

import { Button } from '../../../components/ui/Button';
import {
  CARD_SHADOW,
  CARD_WIDTH,
  STICKY_RADIUS,
  STICKY_THEMES,
} from '../../pinboard/pinboardTokens';
import { prepareStickyText, STICKY_TEXT_LIMIT } from '../artifactLimits';
import { useCreativeTools } from '../CreativeToolsContext';
import { stickyTypography } from './stickyPresentation';

const STICKY_COLORS: StickyColor[] = ['yellow', 'pink', 'blue', 'green'];

export function StickyEditor() {
  const {
    closeTool,
    extensionSource,
    isLive,
    resetSubmission,
    submissionError,
    submissionStatus,
    submitArtifact,
  } = useCreativeTools();
  const sourceArtifact =
    extensionSource?.artifactJson.type === 'sticky' ? extensionSource.artifactJson : null;
  const [text, setText] = useState(sourceArtifact?.text ?? '');
  const [color, setColor] = useState<StickyColor>(sourceArtifact?.color ?? 'yellow');
  const [validationError, setValidationError] = useState<string | null>(null);
  const previewText = text.trim();
  const typography = stickyTypography(previewText);
  const theme = STICKY_THEMES[color];

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const prepared = prepareStickyText(text);
    if (!prepared.ok) {
      setValidationError(prepared.error);
      return;
    }

    setValidationError(null);
    await submitArtifact({ type: 'sticky', text: prepared.text, color });
  }

  function onFormKeyDown(event: KeyboardEvent<HTMLFormElement>) {
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      event.currentTarget.requestSubmit();
    }
  }

  if (submissionStatus === 'success') {
    return (
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-5 bg-rt-surface-sunken px-6 text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-rt-primary-tint text-rt-primary-deep">
          <CheckCircle2 aria-hidden="true" size={28} strokeWidth={1.7} />
        </span>
        <div>
          <h2 className="text-[20px] font-semibold text-rt-ink">Sticky proposed</h2>
          <p role="status" className="mt-1 text-[13px] text-rt-ink-muted">
            It is now on the shared pinboard.
          </p>
        </div>
        <Button onClick={closeTool}>Back to pinboard</Button>
      </div>
    );
  }

  const error = validationError ?? submissionError;

  return (
    <div className="block min-h-0 flex-1 overflow-y-auto md:grid md:grid-cols-[minmax(300px,370px)_minmax(0,1fr)] md:grid-rows-1 md:overflow-hidden">
      <aside className="border-b border-rt-tertiary bg-rt-surface md:min-h-0 md:overflow-y-auto md:border-r md:border-b-0">
        <form
          className="flex flex-col p-5 sm:p-6 md:min-h-full"
          onKeyDown={onFormKeyDown}
          onSubmit={(event) => void onSubmit(event)}
        >
          {extensionSource ? (
            <div className="mb-5 border-l-2 border-rt-secondary bg-rt-secondary-wash px-3 py-2 text-[12px] text-rt-secondary-deep">
              Extending {extensionSource.authorName}&apos;s sticky
            </div>
          ) : null}

          <div className="flex items-baseline justify-between gap-3">
            <label htmlFor="sticky-text" className="text-[13px] font-semibold text-rt-ink">
              Note
            </label>
            <span
              className={`text-[11px] tabular-nums ${
                text.length >= STICKY_TEXT_LIMIT ? 'text-rt-secondary-deep' : 'text-rt-ink-faint'
              }`}
              aria-live="polite"
            >
              {text.length}/{STICKY_TEXT_LIMIT}
            </span>
          </div>
          <textarea
            id="sticky-text"
            autoFocus
            maxLength={STICKY_TEXT_LIMIT}
            rows={7}
            value={text}
            onChange={(event) => {
              setText(event.target.value);
              setValidationError(null);
              if (submissionError) resetSubmission();
            }}
            placeholder="Capture the idea in one clear note"
            className="mt-2 h-36 min-h-36 w-full resize-none rounded-lg border border-rt-tertiary bg-rt-surface px-3.5 py-3 text-[14px] leading-relaxed text-rt-ink outline-none transition-colors placeholder:text-rt-ink-faint focus:border-rt-primary-deep focus:ring-2 focus:ring-rt-primary-tint sm:h-auto"
          />

          <fieldset className="mt-5">
            <legend className="text-[13px] font-semibold text-rt-ink">Colour</legend>
            <div className="mt-2.5 flex gap-2.5">
              {STICKY_COLORS.map((option) => {
                const optionTheme = STICKY_THEMES[option];
                const selected = color === option;
                return (
                  <button
                    key={option}
                    type="button"
                    aria-label={`${option} sticky`}
                    aria-pressed={selected}
                    title={option[0]?.toUpperCase() + option.slice(1)}
                    onClick={() => setColor(option)}
                    className="flex h-9 w-9 items-center justify-center rounded-lg border-2 transition-transform hover:scale-105 focus-visible:ring-2 focus-visible:ring-rt-secondary focus-visible:ring-offset-2 focus-visible:outline-none"
                    style={{
                      background: optionTheme.bg,
                      borderColor: selected ? '#4D6A74' : optionTheme.border,
                    }}
                  >
                    {selected ? <Check aria-hidden="true" size={16} strokeWidth={2.2} /> : null}
                  </button>
                );
              })}
            </div>
          </fieldset>

          <div className="mt-6 md:mt-auto md:pt-6">
            {error ? (
              <p role="alert" className="mb-3 text-[12px] leading-relaxed text-rt-secondary-deep">
                {error}
              </p>
            ) : null}
            <div className="flex justify-end gap-2.5">
              <Button variant="secondary" onClick={closeTool}>
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={!isLive || submissionStatus === 'submitting'}
                title={isLive ? 'Propose sticky (Ctrl+Enter)' : 'Reconnect before proposing'}
              >
                {submissionStatus === 'submitting' ? (
                  <LoaderCircle aria-hidden="true" className="animate-spin" size={16} />
                ) : null}
                {submissionStatus === 'submitting' ? 'Proposing' : 'Propose'}
              </Button>
            </div>
          </div>
        </form>
      </aside>

      <section
        aria-label="Sticky preview"
        className="relative flex min-h-90 items-center justify-center overflow-hidden bg-rt-surface-sunken p-8 md:min-h-0 md:overflow-auto"
        style={{
          backgroundImage: 'radial-gradient(rgba(140,164,172,0.30) 1.3px, transparent 1.3px)',
          backgroundSize: '22px 22px',
        }}
      >
        <div className="absolute top-4 left-5 text-[10px] font-semibold tracking-[0.12em] text-rt-ink-faint uppercase">
          Board preview
        </div>
        <article
          className="flex shrink-0 flex-col overflow-hidden border"
          style={{
            width: CARD_WIDTH.sticky,
            borderRadius: STICKY_RADIUS,
            borderColor: theme.border,
            background: theme.bg,
            boxShadow: CARD_SHADOW,
          }}
        >
          <p
            className="line-clamp-4 wrap-break-word font-medium text-rt-ink"
            style={{
              minHeight: 128,
              padding: '16px 14px 10px',
              fontSize: typography.fontSize,
              lineHeight: typography.lineHeight,
            }}
          >
            {previewText || '\u00a0'}
          </p>
          <footer className="px-3 pt-2 pb-2.5 text-[11px] text-rt-ink-faint">
            <span className="font-medium text-rt-ink-muted">You</span>
            <span className="mx-1">·</span>
            <span>now</span>
          </footer>
        </article>
      </section>
    </div>
  );
}
