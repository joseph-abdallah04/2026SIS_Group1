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
  LLM_KEY_ENCRYPTION_SECRET: z.preprocess(emptyToUndefined, z.string().optional()),
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

export const env = parsed.data;
