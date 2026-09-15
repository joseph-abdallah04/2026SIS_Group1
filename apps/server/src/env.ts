import path from 'node:path';
import { fileURLToPath } from 'node:url';

import dotenv from 'dotenv';
import { z } from 'zod';

// Load env from repo root and apps/server regardless of process cwd (concurrently / workspaces).
const here = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(here, '../../../.env') }); // repo root
dotenv.config({ path: path.resolve(here, '../../.env') }); // apps/server/.env

// Fail-fast env validation. See docs/02-architecture.md §7 (Env/config).
// Empty strings from .env.example are treated as unset so optional URL fields don't fail.
const emptyToUndefined = (v: unknown) => (v === '' || v === undefined ? undefined : v);

/** `true/false`, `1/0` and `yes/no` all appear in hand-written .env files. Accept all three. */
const booleanish = z.preprocess((v) => {
  if (v === '' || v === undefined) return undefined;
  if (typeof v !== 'string') return v;
  const normalized = v.trim().toLowerCase();
  if (['true', '1', 'yes', 'on'].includes(normalized)) return true;
  if (['false', '0', 'no', 'off'].includes(normalized)) return false;
  return v;
}, z.boolean().optional());

const envSchema = z.object({
  // Defaults to `production`, not `development`: an unset variable should cost
  // convenience, never safety. Nothing about *identity* depends on it any more
  // — REST routes and the socket handshake both verify a real token now, in
  // every environment — but that is precisely why the default should stay
  // strict rather than drift back, since the next environment-gated shortcut
  // someone adds inherits this posture for free. Local work opts in via `.env`.
  NODE_ENV: z.enum(['development', 'test', 'production']).default('production'),
  PORT: z.coerce.number().int().positive().default(3001),
  CLIENT_ORIGIN: z.string().url().default('http://localhost:5173'),
  JWT_SECRET: z.preprocess(emptyToUndefined, z.string().min(32)),
  DATABASE_URL: z.preprocess(emptyToUndefined, z.string().url().optional()),
  LIVEKIT_URL: z.preprocess(emptyToUndefined, z.string().url().optional()),
  LIVEKIT_API_KEY: z.preprocess(emptyToUndefined, z.string().optional()),
  LIVEKIT_API_SECRET: z.preprocess(emptyToUndefined, z.string().optional()),
  // AES-256-GCM key for LLM API keys at rest (docs/05 §8). 16+ chars so the derived key
  // has real entropy; generate with `openssl rand -base64 32`.
  LLM_KEY_ENCRYPTION_SECRET: z.preprocess(emptyToUndefined, z.string().min(16).optional()),
  // Whether a user's LLM base URL may resolve to a private or loopback address.
  //
  // Local providers are the whole point of "bring your own model" — Ollama sits on
  // http://localhost:11434 — so this is on in development. In production the same
  // freedom lets any logged-in user point the server at 169.254.169.254 or an internal
  // service and read the response back through the chat panel, so it defaults off.
  // Unset means "follow NODE_ENV"; see the computed value below.
  ASSISTANT_ALLOW_PRIVATE_LLM_HOSTS: booleanish,
  // Ceiling on tokens the assistant may generate per model call. The user pays for these,
  // and an unbounded reply is the difference between a cent and a dollar on a bad prompt.
  ASSISTANT_MAX_OUTPUT_TOKENS: z.coerce.number().int().positive().max(32_000).default(2_048),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Invalid environment variables:');
  for (const issue of parsed.error.issues) {
    console.error(`  ${issue.path.join('.')}: ${issue.message}`);
  }
  process.exit(1);
}

// Failing closed is only safe if it's obvious when it happens — otherwise a
// teammate whose `.env` predates this line is left guessing why the server
// behaves as though it were deployed.
if (!process.env.NODE_ENV) {
  console.warn(
    '⚠️  NODE_ENV is not set — assuming production.\n' +
      '    For local development add NODE_ENV=development to your .env (see .env.example).',
  );
}

// A production server that accepts API keys it cannot encrypt would either store them in
// clear text or fail on the first save. Neither is acceptable once real users are typing
// real keys, so refuse to boot instead of discovering it at runtime.
if (parsed.data.NODE_ENV === 'production' && !parsed.data.LLM_KEY_ENCRYPTION_SECRET) {
  console.error(
    '❌ LLM_KEY_ENCRYPTION_SECRET is required in production — user API keys are stored\n' +
      '   AES-256-GCM encrypted with it. Generate one with `openssl rand -base64 32`.',
  );
  process.exit(1);
}

export const env = {
  ...parsed.data,
  ASSISTANT_ALLOW_PRIVATE_LLM_HOSTS:
    parsed.data.ASSISTANT_ALLOW_PRIVATE_LLM_HOSTS ?? parsed.data.NODE_ENV !== 'production',
};
