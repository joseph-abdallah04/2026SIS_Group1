import bcrypt from 'bcryptjs';
import type { Request } from 'express';
import type { AuthResult, User } from '@roundtable/shared';
import type { LoginInput, SignupInput, UpdateProfileInput } from '@roundtable/shared/schemas';

import { env } from '../../env.js';
import { Prisma, type User as UserRow } from '../../generated/prisma/client.js';
import { prisma } from '../../db.js';
import { sendEmail } from '../../lib/email.js';
import { ApiError } from '../../middleware/error.js';
import { signEmailVerificationToken, signToken, verifyEmailVerificationToken } from './jwt.js';

const BCRYPT_ROUNDS = 10;

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

function isEmailUniqueViolation(err: unknown): boolean {
  return (
    err instanceof Prisma.PrismaClientKnownRequestError &&
    err.code === 'P2002' &&
    (err.meta?.target as string[] | undefined)?.includes('email') === true
  );
}

const EMAIL_TAKEN_MESSAGE = 'An account with this email already exists';
const INVALID_CREDENTIALS_MESSAGE = 'Incorrect email or password';

// Precomputed hash of an arbitrary password, compared against when no user
// exists for the given email — otherwise a missing user returns instantly
// while a wrong password pays bcrypt's ~100ms, a timing side-channel that
// reveals which emails are registered even though the response body/status
// are identical. Never matches any real password.
const DUMMY_PASSWORD_HASH = '$2b$10$LmAfFun7kzbvZiaZ217NjOzKuW/saRKnnoa7DJ0.W84KqLPbKnPh.';

export interface SignupResult {
  ok: true;
}

/** Strips `passwordHash` and converts `createdAt` to the wire's ISO-string shape. */
export function toPublicUser(row: Pick<UserRow, 'id' | 'email' | 'displayName' | 'createdAt'>) {
  return {
    id: row.id,
    email: row.email,
    displayName: row.displayName,
    createdAt: row.createdAt.toISOString(),
  };
}

/** Shared by signup and resend — builds the link and sends the email. */
async function sendVerificationEmail(userId: string, email: string): Promise<void> {
  const token = signEmailVerificationToken({ userId });
  const verifyUrl = `${env.CLIENT_ORIGIN}/verify-email?token=${encodeURIComponent(token)}`;
  await sendEmail({
    to: email,
    subject: 'Verify your RoundTable email',
    html:
      `<p>Click the link below to verify your email and finish setting up your RoundTable account.</p>` +
      `<p><a href="${verifyUrl}">${verifyUrl}</a></p>` +
      `<p>This link expires in 24 hours.</p>`,
  });
}

/**
 * Create a new, unverified account and email a verification link. Does not
 * log the user in — this account has no working session until the emailed
 * link is clicked (`verifyEmail` below issues the first real token).
 *
 * Email is normalised before both the lookup and the write so `Foo@x.com`
 * and `foo@x.com` can't register two accounts around the DB's case-sensitive
 * unique index. A find-then-create check gives a friendly 409 in the common
 * case; the P2002 catch below is the fallback for the rare race where two
 * signups for the same email land concurrently.
 */
export async function signup(input: SignupInput): Promise<SignupResult> {
  const email = input.email.trim().toLowerCase();

  const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (existing) {
    throw new ApiError(409, EMAIL_TAKEN_MESSAGE, 'EMAIL_TAKEN');
  }

  const passwordHash = await hashPassword(input.password);

  let userId: string;
  try {
    const user = await prisma.user.create({
      data: { email, passwordHash, displayName: input.displayName },
      select: { id: true },
    });
    userId = user.id;
  } catch (err) {
    if (isEmailUniqueViolation(err)) {
      throw new ApiError(409, EMAIL_TAKEN_MESSAGE, 'EMAIL_TAKEN');
    }
    throw err;
  }

  // The account already exists at this point — a delivery failure (bad
  // recipient, Resend outage, ...) is not a signup failure, and must not
  // surface as one: an earlier version let this throw, which returned a 500
  // for an account that had, in fact, just been created. That orphaned an
  // unverified row behind a client-visible "Internal server error" with no
  // clean way to retry (signing up again would hit EMAIL_TAKEN). The actual
  // recovery path either way is resend-verification, so failing quietly here
  // and letting that be it is strictly better than failing loudly for
  // something the user didn't do wrong.
  try {
    await sendVerificationEmail(userId, email);
  } catch (err) {
    console.error(`[auth] signup: failed to send verification email to ${email}:`, err);
  }
  return { ok: true };
}

/**
 * Verify credentials and return a fresh token + the public user shape.
 *
 * "No such user" and "wrong password" throw the identical 401 — never a
 * different message or code depending on which part was wrong, so a caller
 * can't use the error to enumerate registered emails.
 */
export async function login(input: LoginInput): Promise<AuthResult> {
  const email = input.email.trim().toLowerCase();

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    // Still pays bcrypt's cost against a dummy hash so this path takes the
    // same time as a real wrong-password rejection below — see
    // DUMMY_PASSWORD_HASH.
    await bcrypt.compare(input.password, DUMMY_PASSWORD_HASH);
    throw new ApiError(401, INVALID_CREDENTIALS_MESSAGE, 'INVALID_CREDENTIALS');
  }

  const passwordMatches = await bcrypt.compare(input.password, user.passwordHash);
  if (!passwordMatches) {
    throw new ApiError(401, INVALID_CREDENTIALS_MESSAGE, 'INVALID_CREDENTIALS');
  }

  // Only reached once credentials are already confirmed correct, so this
  // can't become a new email-enumeration channel — it never runs for a
  // wrong password or an unknown email, both of which already stopped above.
  if (!user.emailVerifiedAt) {
    throw new ApiError(403, 'Please verify your email before logging in', 'EMAIL_NOT_VERIFIED');
  }

  return { token: signToken({ userId: user.id }), user: toPublicUser(user) };
}

/**
 * Both of these take `userId` — resolved by `requireAuth` from the verified
 * JWT — and never a client-supplied id. That's what makes "can't read or
 * write someone else's profile" true by construction: there is no code path
 * that lets a request name a different user (F03).
 */
export async function getUserById(userId: string): Promise<User | null> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  return user ? toPublicUser(user) : null;
}

/**
 * docs/02 §2's documented auth module public surface (`requireAuth`,
 * `getCurrentUser(req)`) — a thin wrapper over `getUserById` for other
 * modules that already have the request object in hand (e.g. a route
 * handler) rather than a bare userId.
 */
export function getCurrentUser(req: Request): Promise<User | null> {
  if (!req.userId) return Promise.resolve(null);
  return getUserById(req.userId);
}

export async function updateDisplayName(
  userId: string,
  displayName: UpdateProfileInput['displayName'],
): Promise<User> {
  try {
    const user = await prisma.user.update({ where: { id: userId }, data: { displayName } });
    return toPublicUser(user);
  } catch (err) {
    // The account behind a still-valid JWT was deleted between the request
    // arriving and this write — same 404 `getUserById` gives for a missing
    // row, rather than a raw P2025 surfacing as a 500.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
      throw new ApiError(404, 'User not found', 'USER_NOT_FOUND');
    }
    throw err;
  }
}

/**
 * Consumes a verification link. Success logs the user in (returns a real
 * `AuthResult`) rather than making them go log in separately as a second
 * step. An already-verified account throws instead of silently
 * no-opping — that's what makes a reused link a "clear error" for the
 * done-when bar, without needing a separate consumed-tokens table: the
 * account's own `emailVerifiedAt` is the single-use gate.
 */
export async function verifyEmail(token: string): Promise<AuthResult> {
  const result = verifyEmailVerificationToken(token);
  if (!result.ok) {
    const message =
      result.code === 'TOKEN_EXPIRED'
        ? 'This verification link has expired'
        : 'This verification link is invalid';
    throw new ApiError(401, message, result.code);
  }

  const user = await prisma.user.findUnique({ where: { id: result.userId } });
  if (!user) {
    throw new ApiError(404, 'User not found', 'USER_NOT_FOUND');
  }
  if (user.emailVerifiedAt) {
    throw new ApiError(409, 'This verification link has already been used', 'ALREADY_VERIFIED');
  }

  const verified = await prisma.user.update({
    where: { id: user.id },
    data: { emailVerifiedAt: new Date() },
  });

  return { token: signToken({ userId: verified.id }), user: toPublicUser(verified) };
}

const RESEND_RATE_LIMIT_MS = 60_000;
// Single-process in-memory map, same rationale as docs/02 §4's guidance on
// lightweight per-process state: this is a rate-limit guard, not data, so
// losing it on a restart just resets everyone's cooldown — harmless.
const lastResendAt = new Map<string, number>();

/**
 * Re-sends the verification email. Rate-limited on the *raw submitted*
 * email, checked before any database lookup, so the 429 itself never reveals
 * whether an account exists for that address — only that address was asked
 * for recently, which the caller already knows. Below the rate limit, the
 * response is identical whether the account exists, is already verified, or
 * doesn't exist at all — same enumeration-safety shape as `login`.
 */
export async function resendVerification(rawEmail: string): Promise<void> {
  const email = rawEmail.trim().toLowerCase();

  const last = lastResendAt.get(email);
  const now = Date.now();
  if (last !== undefined && now - last < RESEND_RATE_LIMIT_MS) {
    throw new ApiError(429, 'Please wait a moment before requesting another email', 'RATE_LIMITED');
  }
  lastResendAt.set(email, now);

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, emailVerifiedAt: true },
  });
  if (user && !user.emailVerifiedAt) {
    // A delivery failure here must not surface as a different HTTP status
    // than the "found but already verified" / "not found" cases above — a
    // 500 only on the "found and unverified, but the send failed" branch
    // would itself be an enumeration signal, defeating the point of this
    // endpoint always responding the same way.
    try {
      await sendVerificationEmail(user.id, email);
    } catch (err) {
      console.error(`[auth] resend-verification: failed to send to ${email}:`, err);
    }
  }
}
