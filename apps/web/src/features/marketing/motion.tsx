import { motion, useReducedMotion, type Variants } from 'motion/react';
import type { ReactNode } from 'react';

const EASE = [0.22, 1, 0.36, 1] as const;

/**
 * Landing-page reveal.
 *
 * Only `y` animates, never `opacity`: jsdom ships no IntersectionObserver, so
 * `whileInView` never fires under test and an opacity-based reveal would leave
 * every assertion reading invisible text.
 * Moving the element instead means the copy is in the DOM and legible whether
 * or not the observer ever runs.
 */
export function Reveal({
  children,
  className,
  delay = 0,
  y = 26,
  as = 'div',
  when = 'view',
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
  y?: number;
  as?: 'div' | 'li' | 'section';
  /** Hero copy plays on mount so above-the-fold text is never left blurred. */
  when?: 'view' | 'mount';
}) {
  const reduce = useReducedMotion();
  const Component = motion[as];
  const shown = { y: 0 };

  return (
    <Component
      className={className}
      initial={reduce ? false : { y }}
      animate={when === 'mount' ? shown : undefined}
      whileInView={when === 'view' ? shown : undefined}
      viewport={{ once: true, amount: 0.15 }}
      transition={{ duration: 0.7, delay, ease: EASE }}
    >
      {children}
    </Component>
  );
}

const WORD: Variants = {
  hidden: { y: '0.55em' },
  shown: { y: 0 },
};

/**
 * Headline that lifts word by word from behind its own baseline. Each word sits
 * in an `overflow-hidden` span so the lift reads as type rising into place
 * rather than sliding in from nowhere.
 */
export function RevealHeading({
  text,
  className = '',
  delay = 0,
  when = 'view',
}: {
  text: string;
  className?: string;
  delay?: number;
  when?: 'view' | 'mount';
}) {
  const reduce = useReducedMotion();
  const words = text.split(' ');

  if (reduce) return <span className={className}>{text}</span>;

  return (
    <motion.span
      className={className}
      initial="hidden"
      animate={when === 'mount' ? 'shown' : undefined}
      whileInView={when === 'view' ? 'shown' : undefined}
      viewport={{ once: true, amount: 0.4 }}
      transition={{ staggerChildren: 0.055, delayChildren: delay }}
      aria-label={text}
    >
      {words.map((word, index) => (
        <span
          key={`${word}-${index}`}
          className="inline-flex overflow-hidden pb-[0.06em] align-bottom"
          aria-hidden="true"
        >
          <motion.span
            variants={WORD}
            transition={{ duration: 0.72, ease: EASE }}
            className="inline-block"
          >
            {word}
          </motion.span>
          {index < words.length - 1 ? <span className="inline-block">&nbsp;</span> : null}
        </span>
      ))}
    </motion.span>
  );
}
