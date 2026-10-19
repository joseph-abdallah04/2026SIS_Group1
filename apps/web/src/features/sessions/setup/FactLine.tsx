interface FactLineProps {
  /** The facts in order; the first, the questions, is the one in bold. */
  facts: readonly string[];
  className?: string;
}

/**
 * A session's facts as one quiet line: "4 questions · About 26 min · Live call".
 * The dots are drawn, and a comma is read in their place.
 */
export function FactLine({ facts, className = '' }: FactLineProps) {
  const [first, ...rest] = facts;
  return (
    <p
      className={`flex min-w-0 flex-wrap items-center gap-x-2 text-[12.5px] text-rt-ink-muted ${className}`}
    >
      <span className="font-semibold text-rt-ink">{first}</span>
      {rest.map((fact) => (
        <span key={fact} className="inline-flex items-center gap-2">
          <span aria-hidden className="size-[3px] rounded-full bg-[#c9bfae]" />
          <span className="sr-only">, </span>
          {fact}
        </span>
      ))}
    </p>
  );
}
