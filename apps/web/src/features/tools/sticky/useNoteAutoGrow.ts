import { useLayoutEffect, type RefObject } from 'react';

/**
 * Grow a note's box to fit its text rather than scrolling it.
 *
 * A sticky is one thought. A box that scrolls hides the start of it behind the
 * end, so you would be writing the last line unable to see the first. Measuring
 * beats counting characters, because how many lines a note takes depends on
 * where the words happen to wrap.
 *
 * The measurement has to be invisible. `scrollHeight` never reports less than
 * the height the box already has, so the box must be released before it is
 * read — and that release, left alone, is what the growth would animate away
 * from, which looks like the note flinching on every keystroke. So the release
 * and the restore both happen with transitions off, and only the final size is
 * allowed to move. Nothing paints in between: it is all one task.
 *
 * `property` says which size to write. A box that owns its own height takes
 * `height`. One a flex parent already stretches takes `minHeight`, where the
 * measurement is not setting the size but raising the floor the parent grows
 * to — writing `height` there would be ignored.
 */
export function useNoteAutoGrow(
  ref: RefObject<HTMLTextAreaElement | null>,
  text: string,
  property: 'height' | 'minHeight' = 'height',
) {
  useLayoutEffect(() => {
    const note = ref.current;
    if (!note) return;

    const from = note.style[property];
    note.style.transition = 'none';
    note.style[property] = property === 'height' ? 'auto' : '0px';
    const to = `${note.scrollHeight}px`;
    note.style[property] = from || to;
    void note.offsetHeight;
    // Back to whatever the stylesheet asks for, which is the easing on the box.
    note.style.transition = '';
    note.style[property] = to;
  }, [ref, text, property]);
}
