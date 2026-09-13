import bcrypt from 'bcryptjs';
import type { Request } from 'express';
import type { AuthResult, User } from '@roundtable/shared';
import type { LoginInput, SignupInput, UpdateProfileInput } from '@roundtable/shared/schemas';

import { Prisma, type User as UserRow } from '../../generated/prisma/client.js';
import { prisma } from '../../db.js';
import { ApiError } from '../../middleware/error.js';
import { signToken } from './jwt.js';

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
  token: string;
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

/**
 * Create a new user and return a ready-to-use session token (docs/06 Auth
 * §API surface — signup responds with `{ token }` only; a separate `GET
 * /api/auth/me` hydrates the user object).
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

  try {
    const user = await prisma.user.create({
      data: { email, passwordHash, displayName: input.displayName },
      select: { id: true },
    });
    return { token: signToken({ userId: user.id }) };
  } catch (err) {
    if (isEmailUniqueViolation(err)) {
      throw new ApiError(409, EMAIL_TAKEN_MESSAGE, 'EMAIL_TAKEN');
    }
    throw err;
  }
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

/**
 * Permanently deletes the requesting user's own row (F33). `userId` comes
 * from `requireAuth`'s verified token, same as every other function in this
 * file — there is no code path that lets a request name a different user.
 *
 * Requires the current password as a fresh proof of intent, distinct from
 * the session token itself: a token alone just means "some tab is logged
 * in," and this is irreversible. Deliberately its own message/code rather
 * than reusing `login`'s INVALID_CREDENTIALS — there's no enumeration
 * concern here (identity is already established by the token), so nothing
 * is gained by being vague about which check failed.
 *
 * What happens to this user's *content* is a schema-level decision, not
 * something this function orchestrates: `Session.leaderId` and
 * `Proposal.authorId` are nullable with `onDelete: SetNull`, so a session
 * this user led or a proposal they authored survives with that reference
 * cleared — other members'/participants' history, reactions, and votes on
 * it are untouched. Everything scoped only to this user (SessionMember,
 * ProposalReaction, Vote, UserLLMConfig) cascades away with the row.
 */
export async function deleteAccount(userId: string, password: string): Promise<void> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    throw new ApiError(404, 'User not found', 'USER_NOT_FOUND');
  }

  const passwordMatches = await bcrypt.compare(password, user.passwordHash);
  if (!passwordMatches) {
    throw new ApiError(401, 'Incorrect password', 'INVALID_PASSWORD');
  }

  await prisma.user.delete({ where: { id: userId } });
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
