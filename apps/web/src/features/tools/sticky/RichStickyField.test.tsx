import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useRef, useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import {
  NO_STICKY_FORMAT,
  RichStickyField,
  StickyFormatBar,
  type RichStickyFieldHandle,
  type StickyFormat,
} from './RichStickyField';
import { toStickyNote, type StickyNote } from './stickyMarks';

function Editor({
  initial = toStickyNote({ text: '' }),
  limit = 500,
  lineLimit,
  maxHeight,
  readOnly = false,
  onChange,
}: {
  initial?: StickyNote;
  limit?: number;
  lineLimit?: number;
  maxHeight?: number;
  readOnly?: boolean;
  onChange?: (note: StickyNote) => void;
}) {
  const field = useRef<RichStickyFieldHandle>(null);
  const [note, setNote] = useState(initial);
  const [format, setFormat] = useState<StickyFormat>(NO_STICKY_FORMAT);
  return (
    <>
      <StickyFormatBar field={field} active={format} />
      <RichStickyField
        ref={field}
        label="Note"
        value={note}
        limit={limit}
        lineLimit={lineLimit}
        maxHeight={maxHeight}
        readOnly={readOnly}
        onFormatChange={setFormat}
        onChange={(next) => {
          setNote(next);
          onChange?.(next);
        }}
      />
      <output data-testid="note">{JSON.stringify(note)}</output>
    </>
  );
}

const noteBox = () => screen.getByRole('textbox', { name: 'Note' });
const current = (): StickyNote => JSON.parse(screen.getByTestId('note').textContent ?? '{}');
const lineElements = () => [...noteBox().querySelectorAll('.rt-sticky-line')] as HTMLElement[];

/**
 * Puts the caret, or a selection, at these offsets into the note's text. A line
 * break is the gap between two line elements, so it counts once between them.
 */
function select(from: number, to = from) {
  const points: { node: Node; offset: number }[] = [];
  let base = 0;
  for (const line of lineElements()) {
    const texts = document.createTreeWalker(line, NodeFilter.SHOW_TEXT);
    const nodes: Text[] = [];
    for (let node = texts.nextNode(); node; node = texts.nextNode()) nodes.push(node as Text);
    const length = nodes.reduce((sum, node) => sum + node.data.length, 0);
    for (const target of [from, to]) {
      if (points.length >= 2 || target < base || target > base + length) continue;
      let reached = base;
      const found = nodes.find((node) => {
        if (target <= reached + node.data.length) return true;
        reached += node.data.length;
        return false;
      });
      points.push(found ? { node: found, offset: target - reached } : { node: line, offset: 0 });
    }
    base += length + 1;
  }
  const [start, end] = points;
  document.getSelection()!.setBaseAndExtent(start!.node, start!.offset, end!.node, end!.offset);
  document.dispatchEvent(new Event('selectionchange'));
}

describe('RichStickyField', () => {
  it('draws a note that arrives formatted, as a draft or an edit does', () => {
    render(
      <Editor
        initial={toStickyNote({
          text: 'Ship the beta',
          marks: [{ from: 0, to: 4, style: 'bold' }],
        })}
      />,
    );

    expect(noteBox().textContent).toBe('Ship the beta');
    expect(noteBox().querySelector('[data-sticky-styles="bold"]')).toHaveTextContent('Ship');
  });

  it('carries on in the style of the word the caret is at the end of', async () => {
    const user = userEvent.setup();
    render(
      <Editor
        initial={toStickyNote({ text: 'Ship', marks: [{ from: 0, to: 4, style: 'bold' }] })}
      />,
    );

    await user.click(noteBox());
    select(4);
    expect(screen.getByRole('button', { name: 'Bold' })).toHaveAttribute('aria-pressed', 'true');
    await user.keyboard('ped');

    expect(current().text).toBe('Shipped');
    expect(current().marks).toEqual([{ from: 0, to: 7, style: 'bold' }]);
  });

  // Deleting through formatted words leaves the formatting on the words that
  // are left, not on whatever slides into their place.
  it('keeps formatting on the right words as others are deleted', async () => {
    const user = userEvent.setup();
    render(
      <Editor
        initial={toStickyNote({
          text: 'Ship the beta',
          marks: [{ from: 9, to: 13, style: 'italic' }],
        })}
      />,
    );

    await user.click(noteBox());
    select(4, 8);
    await user.keyboard('{Backspace}');

    expect(current().text).toBe('Ship beta');
    expect(current().marks).toEqual([{ from: 5, to: 9, style: 'italic' }]);
  });

  it('takes a style off a selection that is already all in it', async () => {
    const user = userEvent.setup();
    render(
      <Editor
        initial={toStickyNote({ text: 'Ship', marks: [{ from: 0, to: 4, style: 'bold' }] })}
      />,
    );

    await user.click(noteBox());
    select(0, 4);
    await user.click(screen.getByRole('button', { name: 'Bold' }));

    expect(current().marks).toEqual([]);
    expect(screen.getByRole('button', { name: 'Bold' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('starts a new line on Enter, as a line of its own', async () => {
    const user = userEvent.setup();
    render(<Editor />);

    await user.type(noteBox(), 'One{Enter}');

    expect(current().text).toBe('One\n');
    expect(lineElements()).toHaveLength(2);

    await user.keyboard('Two');
    expect(current().text).toBe('One\nTwo');
    expect(lineElements().map((line) => line.textContent)).toEqual(['One', 'Two']);
  });

  it('takes no more than the limit, typed or pasted', async () => {
    const user = userEvent.setup();
    render(<Editor limit={10} />);

    await user.type(noteBox(), 'Twelve chars');
    expect(current().text).toBe('Twelve cha');

    await user.paste('more');
    expect(current().text).toBe('Twelve cha');
  });

  it('starts no more lines than the line limit, typed or pasted', async () => {
    const user = userEvent.setup();
    render(<Editor lineLimit={3} />);

    await user.type(noteBox(), 'One{Enter}Two{Enter}Three{Enter}{Enter}');
    expect(current().text).toBe('One\nTwo\nThree');

    // A paste goes in up to the last line there is room for. Replacing "\nTwo"
    // frees one line, so one of the pasted breaks fits.
    select(3, 7);
    await user.paste('A\nB\nC\nD');
    expect(current().text).toBe('OneA\nB\nThree');
  });

  // Typing down past the bottom of a tall note, the note follows the caret.
  it('scrolls a tall note to keep the caret in view as lines are added', async () => {
    const user = userEvent.setup();
    render(<Editor initial={toStickyNote({ text: 'Top' })} maxHeight={100} />);
    const box = noteBox();
    Object.defineProperty(box, 'clientHeight', { configurable: true, value: 100 });
    Object.defineProperty(box, 'scrollHeight', { configurable: true, value: 400 });
    vi.spyOn(box, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 300, 100));
    // The caret sits on the last line, below the bottom of what is showing.
    const caret = vi
      .spyOn(Range.prototype, 'getBoundingClientRect')
      .mockReturnValue(new DOMRect(10, 180, 0, 20));

    await user.click(box);
    select(3);
    await user.keyboard('{Enter}');

    expect(box.scrollTop).toBe(180 + 20 - 100 + 8);
    caret.mockRestore();
  });

  it('takes nothing while it is read-only', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Editor initial={toStickyNote({ text: 'Proposed' })} readOnly onChange={onChange} />);

    await user.type(noteBox(), ' again');

    expect(noteBox().textContent).toBe('Proposed');
    expect(onChange).not.toHaveBeenCalled();
  });

  // Backspace held down, then undo: the run comes back in one step, with the
  // caret where it was rather than the characters selected.
  it('undoes a run of deleting as one step, with the caret where it was', async () => {
    const user = userEvent.setup();
    render(<Editor initial={toStickyNote({ text: 'Line two' })} />);

    await user.click(noteBox());
    select(8);
    await user.keyboard('{Backspace}{Backspace}{Backspace}');
    expect(current().text).toBe('Line ');

    await user.keyboard('{Control>}z{/Control}');

    expect(current().text).toBe('Line two');
    expect(document.getSelection()!.isCollapsed).toBe(true);
  });

  // Formatting is part of what undo takes back, not only the words.
  it('undoes a style as a step of its own', async () => {
    const user = userEvent.setup();
    render(<Editor initial={toStickyNote({ text: 'Ship' })} />);

    await user.click(noteBox());
    select(0, 4);
    await user.keyboard('{Control>}b{/Control}');
    expect(current().marks).toEqual([{ from: 0, to: 4, style: 'bold' }]);

    await user.keyboard('{Control>}z{/Control}');
    expect(current().marks).toEqual([]);
    expect(current().text).toBe('Ship');
  });
});

describe('lists in RichStickyField', () => {
  it('makes the line the caret is on a bulleted list, and plain again', async () => {
    const user = userEvent.setup();
    render(<Editor initial={toStickyNote({ text: 'Intro\nFirst' })} />);

    await user.click(noteBox());
    select(8);
    await user.click(screen.getByRole('button', { name: 'Bulleted list' }));

    expect(current().lines).toEqual([null, 'bullet']);
    expect(lineElements()[1]).toHaveAttribute('data-list', 'bullet');
    expect(screen.getByRole('button', { name: 'Bulleted list' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    await user.click(screen.getByRole('button', { name: 'Bulleted list' }));
    expect(current().lines).toEqual([null, null]);
  });

  it('makes every line a selection touches a numbered list, counting from 1', async () => {
    const user = userEvent.setup();
    render(<Editor initial={toStickyNote({ text: 'Plan\nOne\nTwo\nThree' })} />);

    await user.click(noteBox());
    select(5, 17);
    await user.click(screen.getByRole('button', { name: 'Numbered list' }));

    expect(current().lines).toEqual([null, 'number', 'number', 'number']);
    expect(lineElements().map((line) => line.getAttribute('data-number'))).toEqual([
      null,
      '1',
      '2',
      '3',
    ]);
  });

  // Enter carries a list on, and Enter on an empty item leaves it, rather than
  // making another empty one.
  it('carries a list on with Enter, and leaves it on an empty item', async () => {
    const user = userEvent.setup();
    render(<Editor initial={toStickyNote({ text: 'Milk', lines: ['bullet'] })} />);

    await user.click(noteBox());
    select(4);
    await user.keyboard('{Enter}Eggs{Enter}');
    expect(current().lines).toEqual(['bullet', 'bullet', 'bullet']);

    await user.keyboard('{Enter}');
    expect(current().text).toBe('Milk\nEggs\n');
    expect(current().lines).toEqual(['bullet', 'bullet', null]);
  });

  // Backspace at the start of an item takes its bullet off before anything is
  // deleted; the next one joins it to the line above.
  it('takes the bullet off first when Backspace is pressed at the start of an item', async () => {
    const user = userEvent.setup();
    render(<Editor initial={toStickyNote({ text: 'Milk\nEggs', lines: ['bullet', 'bullet'] })} />);

    await user.click(noteBox());
    select(5);
    await user.keyboard('{Backspace}');
    expect(current().text).toBe('Milk\nEggs');
    expect(current().lines).toEqual(['bullet', null]);

    await user.keyboard('{Backspace}');
    expect(current().text).toBe('MilkEggs');
    expect(current().lines).toEqual(['bullet']);
  });

  it('starts a list from "- " or "1. " at the start of a line, and undo gives them back', async () => {
    const user = userEvent.setup();
    render(<Editor />);

    await user.type(noteBox(), '- Milk');
    expect(current().text).toBe('Milk');
    expect(current().lines).toEqual(['bullet']);

    // The second Enter is on an empty item, so it leaves the list.
    await user.keyboard('{Enter}{Enter}');
    expect(current().text).toBe('Milk\n');
    expect(current().lines).toEqual(['bullet', null]);

    await user.keyboard('1. Plan');
    expect(current().text).toBe('Milk\nPlan');
    expect(current().lines).toEqual(['bullet', 'number']);

    // Back past the words, then past the list the shortcut started.
    await user.keyboard('{Control>}z{/Control}{Control>}z{/Control}');
    expect(current().text).toBe('Milk\n1.');
    expect(current().lines).toEqual(['bullet', null]);
  });

  it('nests an item under the one above with Tab, and brings it out with Shift+Tab', async () => {
    const user = userEvent.setup();
    render(<Editor initial={toStickyNote({ text: 'Plan\nScope', lines: ['number', 'number'] })} />);

    await user.click(noteBox());
    select(7);
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Increase indent' })).toBeEnabled(),
    );
    expect(screen.getByRole('button', { name: 'Decrease indent' })).toBeDisabled();

    await user.keyboard('{Tab}');
    expect(current().levels).toEqual([0, 1]);
    expect(lineElements()[1]).toHaveAttribute('data-level', '1');
    expect(lineElements()[1]).toHaveAttribute('data-number', 'a');
    expect(document.activeElement).toBe(noteBox());

    await user.keyboard('{Shift>}{Tab}{/Shift}');
    expect(current().levels).toEqual([0, 0]);
  });

  // Tab is the list's only while there is a list: anywhere else it moves on,
  // so the note never traps the keyboard.
  it('leaves Tab to the page on a line that is not in a list', async () => {
    const user = userEvent.setup();
    render(
      <>
        <Editor initial={toStickyNote({ text: 'Plain words' })} />
        <button type="button">Next</button>
      </>,
    );

    await user.click(noteBox());
    select(3);
    await user.keyboard('{Tab}');

    expect(current().text).toBe('Plain words');
    expect(document.activeElement).not.toBe(noteBox());
  });

  it('brings an empty nested item out a level on Enter before it leaves the list', async () => {
    const user = userEvent.setup();
    render(
      <Editor
        initial={toStickyNote({ text: 'Plan\nScope', lines: ['bullet', 'bullet'], levels: [0, 1] })}
      />,
    );

    await user.click(noteBox());
    select(10);
    await user.keyboard('{Enter}');
    expect(current().levels).toEqual([0, 1, 1]);

    await user.keyboard('{Enter}');
    expect(current().lines).toEqual(['bullet', 'bullet', 'bullet']);
    expect(current().levels).toEqual([0, 1, 0]);

    await user.keyboard('{Enter}');
    expect(current().lines).toEqual(['bullet', 'bullet', null]);
  });

  it('makes lists with the keyboard shortcuts too', async () => {
    const user = userEvent.setup();
    render(<Editor initial={toStickyNote({ text: 'Item' })} />);

    await user.click(noteBox());
    select(2);
    await user.keyboard('{Control>}{Shift>}8{/Shift}{/Control}');
    expect(current().lines).toEqual(['bullet']);

    await user.keyboard('{Control>}{Shift>}7{/Shift}{/Control}');
    expect(current().lines).toEqual(['number']);
  });
});

describe('links in RichStickyField', () => {
  const linkBox = () => screen.getByRole('textbox', { name: 'Link address' });

  it('links the selected words to the address typed, taken to be https', async () => {
    const user = userEvent.setup();
    render(<Editor initial={toStickyNote({ text: 'Read the spec' })} />);

    await user.click(noteBox());
    select(9, 13);
    await user.click(screen.getByRole('button', { name: 'Link' }));
    await user.type(linkBox(), 'example.com/spec{Enter}');

    expect(current().links).toEqual([{ from: 9, to: 13, href: 'https://example.com/spec' }]);
    expect(screen.queryByRole('group', { name: 'Link' })).toBeNull();
    expect(noteBox().querySelector('.rt-sticky-link')).toHaveTextContent('spec');
    expect(document.activeElement).toBe(noteBox());
  });

  it('puts the address in as its own words when nothing is selected', async () => {
    const user = userEvent.setup();
    render(<Editor initial={toStickyNote({ text: 'See ' })} />);

    await user.click(noteBox());
    select(4);
    await user.keyboard('{Control>}k{/Control}');
    await user.type(linkBox(), 'example.com{Enter}');

    expect(current().text).toBe('See example.com');
    expect(current().links).toEqual([{ from: 4, to: 15, href: 'https://example.com/' }]);
  });

  // Everybody on the board presses these, so only a website is taken.
  it('refuses an address that is not a website, and says what it wants', async () => {
    const user = userEvent.setup();
    render(<Editor initial={toStickyNote({ text: 'Press here' })} />);

    await user.click(noteBox());
    select(0, 5);
    await user.keyboard('{Control>}k{/Control}');
    await user.type(linkBox(), 'javascript:alert(1){Enter}');

    expect(current().links).toEqual([]);
    expect(linkBox()).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByText('Enter a web address, like example.com')).toBeInTheDocument();
  });

  it('edits or removes the whole link the caret is in', async () => {
    const user = userEvent.setup();
    const href = 'https://example.com/spec';
    render(
      <Editor
        initial={toStickyNote({ text: 'Read the spec', links: [{ from: 9, to: 13, href }] })}
      />,
    );

    await user.click(noteBox());
    select(11);
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Link' })).toHaveAttribute('aria-pressed', 'true'),
    );
    await user.keyboard('{Control>}k{/Control}');
    expect(linkBox()).toHaveValue(href);
    expect(screen.getByRole('link', { name: 'Open link' })).toHaveAttribute('href', href);

    await user.clear(linkBox());
    await user.type(linkBox(), 'https://example.org/{Enter}');
    expect(current().links).toEqual([{ from: 9, to: 13, href: 'https://example.org/' }]);

    select(10);
    await user.click(screen.getByRole('button', { name: 'Link' }));
    await user.click(screen.getByRole('button', { name: 'Remove link' }));
    expect(current().links).toEqual([]);
    expect(current().text).toBe('Read the spec');
  });

  // Escape puts the address box away, not whatever the note sits in.
  it('puts the box away on Escape, leaving the note as it was', async () => {
    const user = userEvent.setup();
    const onOuterKeyDown = vi.fn();
    render(
      <div onKeyDown={onOuterKeyDown}>
        <Editor initial={toStickyNote({ text: 'Read the spec' })} />
      </div>,
    );

    await user.click(noteBox());
    select(9, 13);
    await user.keyboard('{Control>}k{/Control}');
    onOuterKeyDown.mockClear();
    await user.keyboard('{Escape}');

    expect(screen.queryByRole('group', { name: 'Link' })).toBeNull();
    expect(onOuterKeyDown).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(noteBox());
    expect(current().links).toEqual([]);
  });

  it('links selected words to a web address pasted over them', async () => {
    const user = userEvent.setup();
    render(<Editor initial={toStickyNote({ text: 'Read the spec' })} />);

    await user.click(noteBox());
    select(9, 13);
    await user.paste('https://example.com/spec');

    expect(current().text).toBe('Read the spec');
    expect(current().links).toEqual([{ from: 9, to: 13, href: 'https://example.com/spec' }]);
  });

  it('pastes anything that is not only a web address as words', async () => {
    const user = userEvent.setup();
    render(<Editor initial={toStickyNote({ text: 'Read the spec' })} />);

    await user.click(noteBox());
    select(9, 13);
    await user.paste('javascript:alert(1)');

    expect(current().text).toBe('Read the javascript:alert(1)');
    expect(current().links).toEqual([]);
  });

  // Typing on after a link carries the sentence on, not the link.
  it('does not carry a link on into the words typed after it', async () => {
    const user = userEvent.setup();
    const href = 'https://example.com/spec';
    render(
      <Editor initial={toStickyNote({ text: 'Read spec', links: [{ from: 5, to: 9, href }] })} />,
    );

    await user.click(noteBox());
    select(9);
    await user.keyboard(' now');

    expect(current().text).toBe('Read spec now');
    expect(current().links).toEqual([{ from: 5, to: 9, href }]);
  });

  it('links a web address as soon as Enter finishes it', async () => {
    const user = userEvent.setup();
    render(<Editor />);

    await user.type(noteBox(), 'Docs: https://example.com/docs{Enter}Next');

    expect(current().text).toBe('Docs: https://example.com/docs\nNext');
    expect(current().links).toEqual([{ from: 6, to: 30, href: 'https://example.com/docs' }]);
    expect(noteBox().querySelector('.rt-sticky-link')).toHaveTextContent(
      'https://example.com/docs',
    );
  });

  it('links a web address finished with a space, leaving the full stop after it out', async () => {
    const user = userEvent.setup();
    render(<Editor />);

    await user.type(noteBox(), 'See www.example.com. Then');

    expect(current().links).toEqual([{ from: 4, to: 19, href: 'https://www.example.com/' }]);
  });

  // Undo takes back the link the address was given, and leaves it typed.
  it('takes the link off first on undo, keeping the address as typed', async () => {
    const user = userEvent.setup();
    render(<Editor />);

    await user.type(noteBox(), 'https://example.com{Enter}');
    expect(current().links).toHaveLength(1);

    await user.keyboard('{Control>}z{/Control}');
    expect(current().links).toEqual([]);
    expect(current().text).toBe('https://example.com\n');
  });

  // At the line limit Enter starts no line, but the address is still finished.
  it('still links an address when Enter is pressed at the line limit', async () => {
    const user = userEvent.setup();
    render(<Editor lineLimit={1} />);

    await user.type(noteBox(), 'https://example.com{Enter}');

    expect(current().text).toBe('https://example.com');
    expect(current().links).toEqual([{ from: 0, to: 19, href: 'https://example.com/' }]);
  });

  it('leaves words that are not a web address as words', async () => {
    const user = userEvent.setup();
    render(<Editor />);

    await user.type(noteBox(), 'notes.txt and example.com{Enter}');

    expect(current().links).toEqual([]);
  });
});
