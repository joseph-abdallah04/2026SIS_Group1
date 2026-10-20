import { GripVertical, Lightbulb, SquareCheckBig, X } from 'lucide-react';
import type {
  ClipboardEventHandler,
  CSSProperties,
  KeyboardEventHandler,
  PointerEventHandler,
  DragEventHandler,
} from 'react';

import type { SetupQuestion } from './useSessionSetupForm';

/** The counter shows once a question is within this many characters of the limit. */
const COUNTER_WITHIN = 30;

export interface DragHandleProps {
  onPointerDown: PointerEventHandler<HTMLElement>;
  onDragStart: DragEventHandler<HTMLElement>;
}

interface QuestionRowProps {
  question: SetupQuestion;
  /** Its number as shown: during a drag, the place it would land in. */
  number: number;
  /** The text box's own limit: nothing longer can be typed. */
  maxLength: number;
  /**
   * A draft being edited: a question longer than the limit, written before it
   * came down, still saves. Its count is shown, but not as an error.
   */
  acceptsLonger?: boolean;
  lifted: boolean;
  /** Arrives with a template or a paste: slides in, `entering` places after the first. */
  entering: number | null;
  style: CSSProperties | undefined;
  handle: DragHandleProps;
  canRemove: boolean;
  inputRef: (element: HTMLInputElement | null) => void;
  /** The drag handle, for focus to go back to after the arrow keys move the row. */
  handleRef: (element: HTMLButtonElement | null) => void;
  onText: (text: string) => void;
  onVoting: (votingEnabled: boolean) => void;
  onRemove: () => void;
  onKeyDown: KeyboardEventHandler<HTMLInputElement>;
  onHandleKeyDown: KeyboardEventHandler<HTMLButtonElement>;
  onPaste: ClipboardEventHandler<HTMLInputElement>;
}

/**
 * R2: one question of the agenda. Its handle drags it (D1), its number says
 * where it is, and a two-way switch names both of what a question can be: put
 * to a vote, or ideas only. Remove shows on hover or focus, and always on a
 * touch screen.
 */
export function QuestionRow({
  question,
  number,
  maxLength,
  acceptsLonger = false,
  lifted,
  entering,
  style,
  handle,
  canRemove,
  inputRef,
  handleRef,
  onText,
  onVoting,
  onRemove,
  onKeyDown,
  onHandleKeyDown,
  onPaste,
}: QuestionRowProps) {
  const length = question.text.length;
  const counting = length >= maxLength - COUNTER_WITHIN;
  // Past what a new question may be. A draft's older long one still saves.
  const over = length > maxLength;
  const kind = (on: boolean, tone: 'vote' | 'ideas') =>
    `flex h-8 cursor-pointer items-center gap-[5px] rounded-full px-3 text-[12.5px] font-semibold transition-[background-color,color,box-shadow] duration-150 focus-visible:ring-2 focus-visible:ring-rt-secondary focus-visible:outline-none max-sm:px-2 ${
      on
        ? tone === 'vote'
          ? 'bg-white text-rt-secondary-deep shadow-[0_0_0_1px_rgba(224,163,60,0.6),0_1px_2px_rgba(60,40,20,0.14)]'
          : 'bg-white text-[#9a6a1c] shadow-[0_0_0_1px_rgba(154,106,28,0.4),0_1px_2px_rgba(60,40,20,0.14)]'
        : 'text-rt-ink-muted hover:text-rt-ink'
    }`;

  return (
    <li
      data-question-key={question.key}
      style={
        entering === null ? style : { ...style, ['--rt-row-index' as string]: String(entering) }
      }
      className={`group flex items-center gap-2 rounded-[14px] ${entering === null ? '' : 'rt-setup-row-in'} ${
        lifted
          ? 'bg-[#fffdf8] shadow-[0_12px_30px_rgba(60,40,20,0.2),0_0_0_1px_rgba(224,163,60,0.5)]'
          : ''
      }`}
    >
      <button
        ref={handleRef}
        type="button"
        aria-label={`Move question ${number}`}
        title="Drag to move, or use the arrow keys"
        {...handle}
        onKeyDown={onHandleKeyDown}
        className={`flex h-[30px] w-[18px] shrink-0 touch-none items-center justify-center rounded-md text-[#c3b9a6] hover:bg-rt-secondary/15 hover:text-rt-secondary-deep focus-visible:ring-2 focus-visible:ring-rt-secondary focus-visible:outline-none ${
          lifted ? 'cursor-grabbing' : 'cursor-grab'
        }`}
      >
        <GripVertical aria-hidden size={15} />
      </button>
      <span
        aria-hidden
        className={`flex size-6 shrink-0 items-center justify-center rounded-full border text-[11.5px] font-semibold tabular-nums transition-colors max-sm:hidden ${
          lifted
            ? 'border-rt-secondary bg-rt-secondary text-white'
            : 'border-rt-tertiary/80 bg-rt-surface-alt text-rt-ink-muted'
        }`}
      >
        {number}
      </span>
      <span className="relative min-w-0 flex-1">
        <input
          ref={inputRef}
          autoComplete="off"
          type="text"
          value={question.text}
          onChange={(e) => onText(e.target.value)}
          onKeyDown={onKeyDown}
          onPaste={onPaste}
          placeholder={number === 1 ? 'What should the room answer first?' : `Question ${number}`}
          aria-label={`Question ${number}`}
          maxLength={maxLength}
          className={`h-11 w-full rounded-xl border border-rt-tertiary bg-white pl-3.5 text-[14px] text-rt-ink transition-[border-color,box-shadow] outline-none placeholder:text-rt-ink-faint focus:border-rt-secondary focus:shadow-[0_0_0_3px_rgba(224,163,60,0.28)] ${
            counting ? 'pr-[58px]' : 'pr-3'
          }`}
        />
        {counting ? (
          <span
            aria-live="polite"
            title={
              over && acceptsLonger
                ? 'Written before the limit came down: it still saves'
                : undefined
            }
            className={`absolute top-1/2 right-2.5 -translate-y-1/2 text-[10.5px] font-semibold tabular-nums ${
              over && !acceptsLonger
                ? 'pointer-events-none text-red-700'
                : length >= maxLength
                  ? 'text-rt-secondary-deep'
                  : 'pointer-events-none text-rt-ink-faint'
            }`}
          >
            {length}/{maxLength}
          </span>
        ) : null}
      </span>
      <span
        role="group"
        aria-label={`Question ${number}: vote or ideas only`}
        className="flex shrink-0 rounded-full border border-rt-tertiary/70 bg-rt-surface-alt p-0.5"
      >
        <button
          type="button"
          aria-pressed={question.votingEnabled}
          title="The team votes on this question"
          onClick={() => onVoting(true)}
          className={kind(question.votingEnabled, 'vote')}
        >
          <SquareCheckBig aria-hidden size={13} />
          <span className="max-sm:sr-only">Vote</span>
        </button>
        <button
          type="button"
          aria-pressed={!question.votingEnabled}
          title="Brainstorm only: the team adds ideas, and nobody votes"
          onClick={() => onVoting(false)}
          className={kind(!question.votingEnabled, 'ideas')}
        >
          <Lightbulb aria-hidden size={13} />
          <span className="max-sm:sr-only">Ideas</span>
        </button>
      </span>
      <button
        type="button"
        onClick={onRemove}
        disabled={!canRemove}
        aria-label={`Remove question ${number}`}
        title="Remove"
        className="flex size-7 shrink-0 items-center justify-center rounded-full text-rt-ink-faint opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100 hover:bg-red-50 hover:text-red-700 focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-rt-secondary focus-visible:outline-none disabled:invisible pointer-coarse:opacity-100"
      >
        <X aria-hidden size={15} />
      </button>
    </li>
  );
}
