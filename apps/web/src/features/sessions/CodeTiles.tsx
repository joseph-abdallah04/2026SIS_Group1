/**
 * A join code as tiles, one character each, with its hyphen between the two
 * halves: big and spaced enough to read off a screen across a room.
 *
 * Read as the code itself, not as nine separate letters.
 */
export function CodeTiles({ code, size = 'card' }: { code: string; size?: 'card' | 'present' }) {
  return (
    <span
      role="img"
      aria-label={code}
      className="rt-code-tiles"
      data-size={size === 'present' ? 'present' : undefined}
    >
      {[...code].map((char, index) =>
        char === '-' ? (
          // Positional: a code never reorders.
          <span key={index} aria-hidden="true" className="rt-code-dash">
            –
          </span>
        ) : (
          <span key={index} aria-hidden="true" className="rt-code-tile">
            {char}
          </span>
        ),
      )}
    </span>
  );
}
