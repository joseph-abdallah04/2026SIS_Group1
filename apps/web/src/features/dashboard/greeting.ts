const DAY_MS = 24 * 60 * 60 * 1000;

/** How long since the latest session before it has been "a while". */
export const A_WHILE_MS = 14 * DAY_MS;

/** How long an account counts as new, for the welcome. */
export const NEW_ACCOUNT_MS = 7 * DAY_MS;

/**
 * The dashboard's display line, chosen once a visit. It reacts only when
 * something has changed, and otherwise says what the product is for:
 *
 * 1. A new account with nothing here yet: a welcome to RoundTable. New, not
 *    only empty: somebody who has cleared out all their sessions is no
 *    newcomer.
 * 2. The latest session over two weeks old: it has been a while. Read from
 *    the sessions themselves, so it holds on any device.
 * 3. Every other time: "Let's decide".
 */
export function greetingFor({
  firstName,
  sessionDates,
  accountCreatedAt,
  now = new Date(),
}: {
  firstName: string;
  /** When each of this person's sessions was made. */
  sessionDates: readonly (Date | string)[];
  /** When the account was made. */
  accountCreatedAt: Date | string;
  now?: Date;
}): string {
  if (sessionDates.length === 0) {
    const age = now.getTime() - new Date(accountCreatedAt).getTime();
    return age < NEW_ACCOUNT_MS
      ? `Welcome to RoundTable, ${firstName}`
      : `Let’s decide, ${firstName}`;
  }

  const latest = Math.max(...sessionDates.map((date) => new Date(date).getTime()));
  if (now.getTime() - latest > A_WHILE_MS) return `It’s been a while, ${firstName}`;

  return `Let’s decide, ${firstName}`;
}
