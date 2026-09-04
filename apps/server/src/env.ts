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
  // Defaults to `production`, not `development`, because this one variable
  // gates every dev-only identity escape hatch we have: the `x-dev-user-id`
  // header (modules/sessions/routes.ts), the socket handshake's `devUserId`
  // (realtime/gateway.ts), and open board reads (modules/pinboard/routes.ts).
  // Defaulting the other way would turn "someone forgot to set NODE_ENV on
  // Render" into "anyone who can send a header can act as any user". Unset
  // must therefore fail closed; local work opts in via `.env`.
  NODE_ENV: z.enum(['development', 'test', 'production']).default('production'),
  PORT: z.coerce.number().int().positive().default(3001),
  CLIENT_ORIGIN: z.string().url().default('http://localhost:5173'),
  JWT_SECRET: z.preprocess(emptyToUndefined, z.string().min(32).optional()),
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
// teammate whose `.env` predates this line just sees unexplained 401s.
if (!process.env.NODE_ENV) {
  console.warn(
    '⚠️  NODE_ENV is not set — assuming production, so dev identity headers are refused.\n' +
      '    For local development add NODE_ENV=development to your .env (see .env.example).',
  );
}

export const env = parsed.data;
