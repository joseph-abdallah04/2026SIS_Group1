import bcrypt from 'bcryptjs';
import type { AuthResult } from '@roundtable/shared';
import type { LoginInput, SignupInput } from '@roundtable/shared/schemas';

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
    throw new ApiError(401, INVALID_CREDENTIALS_MESSAGE, 'INVALID_CREDENTIALS');
  }

  const passwordMatches = await bcrypt.compare(input.password, user.passwordHash);
  if (!passwordMatches) {
    throw new ApiError(401, INVALID_CREDENTIALS_MESSAGE, 'INVALID_CREDENTIALS');
  }

  return { token: signToken({ userId: user.id }), user: toPublicUser(user) };
}
