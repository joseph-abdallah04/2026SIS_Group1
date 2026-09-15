import { Fragment } from 'react';

import { lineAttributes, STICKY_LINE_CLASS, STICKY_LINK_CLASS } from './stickyDom';
import {
  linkRuns,
  segmentStyle,
  stickyBlocks,
  type StickyContent,
  type StickySegment,
} from './stickyMarks';

function Run({ segment }: { segment: StickySegment }) {
  return segment.styles.length ? (
    <span style={segmentStyle(segment.styles, segment.href !== undefined)}>{segment.text}</span>
  ) : (
    <>{segment.text}</>
  );
}

/**
 * A sticky's note, with its formatting, lists and links, one element a line.
 *
 * Plain runs are plain text and formatted runs are spans styled inline, built
 * from the note's words, ranges and line styles. Nothing a peer wrote is ever
 * treated as markup, so there is nothing here to sanitise. Goes inside a block,
 * not a paragraph, since every line is a block of its own.
 *
 * Links open in a new tab, with nothing of the board passed to the site they
 * open. Every address has already been checked to be a website by the time it
 * gets here: see `normalizeLinks`. Where the note sits inside a control of its
 * own — a card that is itself a vote button — `links="inert"` draws them looking
 * the same, without anything to press inside what is already a press.
 */
export function StickyText({
  note,
  links = 'open',
}: {
  note: StickyContent;
  links?: 'open' | 'inert';
}) {
  return (
    <>
      {stickyBlocks(note).map((block, index) => (
        <div key={index} className={STICKY_LINE_CLASS} {...lineAttributes(block)}>
          {block.segments.length ? (
            linkRuns(block.segments).map((run, part) => {
              const runs = run.segments.map((segment, each) => (
                <Run key={each} segment={segment} />
              ));
              if (run.href === null) return <Fragment key={part}>{runs}</Fragment>;
              if (links === 'inert') {
                return (
                  <span key={part} className={STICKY_LINK_CLASS}>
                    {runs}
                  </span>
                );
              }
              return (
                <a
                  key={part}
                  href={run.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={run.href}
                  className={STICKY_LINK_CLASS}
                  // Its own press, not the card's: a card is dragged from
                  // anywhere on it, and pressed to shortlist it.
                  draggable={false}
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={(event) => event.stopPropagation()}
                >
                  {runs}
                </a>
              );
            })
          ) : (
            <br />
          )}
        </div>
      ))}
    </>
  );
}
