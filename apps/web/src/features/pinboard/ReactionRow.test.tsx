import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QUICK_REACTIONS, reactionLabel, type ReactionGroup } from '@roundtable/shared';
import { describe, expect, it, vi } from 'vitest';

import { EMOJI_GROUPS } from './emojiCatalog';
import { ReactionRow } from './ReactionRow';

const [THUMB, HEART] = QUICK_REACTIONS;
/** Only reachable through the picker, never one of the fixed chips. */
const PARTY = '🎉';

function renderRow({
  reactions = [] as ReactionGroup[],
  viewerId = 'viewer' as string | null,
  onReact = vi.fn(async () => {}),
} = {}) {
  render(<ReactionRow reactions={reactions} viewerId={viewerId} onReact={onReact} />);
  return { onReact };
}

/** The chip for one emoji, found by the label a screen reader would read. */
function chip(emoji: string, count?: number) {
  const label = reactionLabel(emoji);
  return screen.getByRole('button', {
    name: count === undefined ? label : `${label} (${count})`,
  });
}

const moreButton = () => screen.getByRole('button', { name: 'More reactions' });

describe('reaction row', () => {
  // The first reaction on a card is the one that matters, and nobody joins a
  // count of zero they cannot see.
  it('offers the quick chips and the picker on a card nobody has reacted to', () => {
    renderRow();

    for (const emoji of QUICK_REACTIONS) {
      expect(chip(emoji)).toBeTruthy();
    }
    expect(moreButton()).toBeTruthy();
  });

  it('counts the people who reacted', () => {
    renderRow({ reactions: [{ emoji: THUMB, userIds: ['a', 'b', 'c'] }] });

    expect(chip(THUMB, 3).textContent).toContain('3');
    // An emoji nobody used stays a bare chip rather than showing a zero.
    expect(chip(HEART).textContent).not.toContain('0');
  });

  it('presses the chips this viewer reacted with, and only those', () => {
    renderRow({
      viewerId: 'viewer',
      reactions: [
        { emoji: THUMB, userIds: ['someone', 'viewer'] },
        { emoji: HEART, userIds: ['someone'] },
      ],
    });

    expect(chip(THUMB, 2).getAttribute('aria-pressed')).toBe('true');
    expect(chip(HEART, 1).getAttribute('aria-pressed')).toBe('false');
  });

  it('asks for the emoji that was clicked', async () => {
    const { onReact } = renderRow();

    await userEvent.click(chip(HEART));

    expect(onReact).toHaveBeenCalledWith(HEART);
  });

  // Pressing an existing reaction asks for the same toggle. Which direction it
  // goes is the server's decision, so the row sends one intent either way.
  it('sends the same intent when taking a reaction back', async () => {
    const { onReact } = renderRow({ reactions: [{ emoji: THUMB, userIds: ['viewer'] }] });

    await userEvent.click(chip(THUMB, 1));

    expect(onReact).toHaveBeenCalledTimes(1);
    expect(onReact).toHaveBeenCalledWith(THUMB);
  });

  // A chip held open while its write is in flight cannot queue a stack of
  // intents behind an impatient finger.
  it('holds the chip closed until the write settles', async () => {
    let settle = () => {};
    const onReact = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          settle = resolve;
        }),
    );
    render(<ReactionRow reactions={[]} viewerId="viewer" onReact={onReact} />);

    await userEvent.click(chip(THUMB));
    expect(chip(THUMB).hasAttribute('disabled')).toBe(true);

    // The other chips stay live: one reaction saving is not the card freezing.
    expect(chip(HEART).hasAttribute('disabled')).toBe(false);

    settle();
    await vi.waitFor(() => expect(chip(THUMB).hasAttribute('disabled')).toBe(false));
  });

  // Before the join snapshot lands there is nobody to react as, and the server
  // would refuse the write anyway.
  it('offers nothing to press until the viewer is known', () => {
    renderRow({ viewerId: null });

    for (const emoji of QUICK_REACTIONS) {
      expect(chip(emoji).hasAttribute('disabled')).toBe(true);
    }
    expect(moreButton().hasAttribute('disabled')).toBe(true);
  });

  // Counts are shared, but "did I react" is not: the same board data must
  // press different chips for different people.
  it('reads the pressed state from the viewer, not from the reaction', () => {
    const reactions = [{ emoji: THUMB, userIds: ['someone-else'] }];
    const { unmount } = render(
      <ReactionRow reactions={reactions} viewerId="viewer" onReact={vi.fn()} />,
    );
    expect(chip(THUMB, 1).getAttribute('aria-pressed')).toBe('false');
    unmount();

    render(<ReactionRow reactions={reactions} viewerId="someone-else" onReact={vi.fn()} />);
    expect(chip(THUMB, 1).getAttribute('aria-pressed')).toBe('true');
  });

  describe('ordering', () => {
    it('shows an emoji from the picker with its count', () => {
      renderRow({ reactions: [{ emoji: PARTY, userIds: ['a', 'b'] }] });

      expect(chip(PARTY, 2).textContent).toContain('2');
    });

    // The bug this replaces: the untouched chips held their places even while
    // invisible, so the single reaction a card had was pushed out to the right
    // of three gaps and looked unattached to the card.
    it('puts what people reacted with first, whether or not it is a quick one', () => {
      renderRow({
        reactions: [
          { emoji: PARTY, userIds: ['a'] },
          { emoji: HEART, userIds: ['b'] },
        ],
      });

      const labels = screen
        .getAllByRole('button')
        .map((button) => button.getAttribute('aria-label'));

      expect(labels).toEqual([
        // Used, in the server's order, which is the order they first appeared.
        `${reactionLabel(PARTY)} (1)`,
        `${reactionLabel(HEART)} (1)`,
        // Then the quick chips still untouched, in contract order.
        ...QUICK_REACTIONS.filter((emoji) => emoji !== HEART).map((emoji) => reactionLabel(emoji)),
        'More reactions',
      ]);
    });

    // A quick emoji that has been used is already in the first group, so
    // offering it again would give one reaction two chips and two counts.
    it('does not repeat a quick emoji among the untouched ones', () => {
      renderRow({ reactions: [{ emoji: THUMB, userIds: ['a'] }] });

      const labels = screen
        .getAllByRole('button')
        .map((button) => button.getAttribute('aria-label'));

      expect(labels.filter((label) => label?.startsWith(reactionLabel(THUMB)))).toEqual([
        `${reactionLabel(THUMB)} (1)`,
      ]);
    });
  });

  describe('the picker', () => {
    it('opens on the more button and offers the whole catalogue', async () => {
      renderRow();

      await userEvent.click(moreButton());

      const picker = screen.getByRole('dialog', { name: 'Pick a reaction' });
      expect(picker).toBeTruthy();
      // The first category is showing, so its emoji are all reachable.
      const first = EMOJI_GROUPS[0];
      expect(first).toBeTruthy();
      for (const [emoji] of first!.emojis.slice(0, 5)) {
        expect(screen.getByRole('button', { name: reactionLabel(emoji) })).toBeTruthy();
      }
    });

    it('reacts with what was picked and closes', async () => {
      const { onReact } = renderRow();

      await userEvent.click(moreButton());
      await userEvent.click(screen.getByRole('tab', { name: 'Gestures' }));
      await userEvent.click(screen.getByRole('button', { name: reactionLabel('🙏') }));

      expect(onReact).toHaveBeenCalledWith('🙏');
      expect(screen.queryByRole('dialog')).toBeNull();
    });

    it('closes on Escape without reacting', async () => {
      const { onReact } = renderRow();

      await userEvent.click(moreButton());
      await userEvent.keyboard('{Escape}');

      expect(screen.queryByRole('dialog')).toBeNull();
      expect(onReact).not.toHaveBeenCalled();
    });

    it('closes on a press outside it', async () => {
      renderRow();

      await userEvent.click(moreButton());
      await userEvent.click(document.body);

      expect(screen.queryByRole('dialog')).toBeNull();
    });

    // The picker is where you go to change a reaction you left from the
    // picker, so it has to say which ones those are.
    it('marks the emoji this viewer already left', async () => {
      renderRow({ viewerId: 'viewer', reactions: [{ emoji: PARTY, userIds: ['viewer'] }] });

      await userEvent.click(moreButton());
      await userEvent.click(screen.getByRole('textbox', { name: 'Search emoji' }));
      await userEvent.paste('party popper');

      expect(
        within(screen.getByRole('dialog', { name: 'Pick a reaction' }))
          .getByRole('button', { name: reactionLabel(PARTY) })
          .getAttribute('aria-pressed'),
      ).toBe('true');
    });

    describe('search', () => {
      const searchBox = () => screen.getByRole('textbox', { name: 'Search emoji' });
      // Scoped to the panel: a quick chip and a picker result can carry the
      // same accessible name, and only one of them is what a search test means.
      const inPicker = () => within(screen.getByRole('dialog', { name: 'Pick a reaction' }));

      /**
       * Pasted rather than typed. Typing re-runs the search on every keystroke,
       * and the early one-letter prefixes match hundreds of emoji, so each of
       * these tests would render several very large grids to reach a small one.
       */
      const search = async (text: string) => {
        await userEvent.click(searchBox());
        await userEvent.paste(text);
      };

      // Nine hundred emoji in seven categories is a lot of scrolling when you
      // already know which one you want.
      it('narrows the grid to what was typed, across every category', async () => {
        renderRow();
        await userEvent.click(moreButton());

        await search('rocket');

        // The rocket lives in Activity, and the search reached it from
        // Smileys, which is the category that was open.
        expect(inPicker().getByRole('button', { name: reactionLabel('🚀') })).toBeTruthy();
        expect(inPicker().queryByRole('button', { name: reactionLabel('😀') })).toBeNull();
      });

      it('reacts with a searched emoji and closes', async () => {
        const { onReact } = renderRow();
        await userEvent.click(moreButton());

        await search('party popper');
        await userEvent.click(inPicker().getByRole('button', { name: reactionLabel(PARTY) }));

        expect(onReact).toHaveBeenCalledWith(PARTY);
        expect(screen.queryByRole('dialog')).toBeNull();
      });

      // Every word has to match something, so a second word narrows rather
      // than widens.
      it('treats several words as all of them, not any of them', async () => {
        renderRow();
        await userEvent.click(moreButton());

        await search('red heart');

        expect(inPicker().getByRole('button', { name: reactionLabel('❤️') })).toBeTruthy();
        expect(inPicker().queryByRole('button', { name: reactionLabel('💙') })).toBeNull();
      });

      it('says so when nothing matches', async () => {
        renderRow();
        await userEvent.click(moreButton());

        await search('zzzzz');

        expect(screen.getByText(/No emoji match/)).toBeTruthy();
      });

      // A category and a search narrow the same grid, so picking one has to
      // let go of the other.
      it('clears the search when a category is chosen', async () => {
        renderRow();
        await userEvent.click(moreButton());

        await search('rocket');
        await userEvent.click(screen.getByRole('tab', { name: 'Smileys' }));

        expect(searchBox()).toHaveValue('');
        expect(inPicker().getByRole('button', { name: reactionLabel('😀') })).toBeTruthy();
      });
    });
  });
});
