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
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3001),
  CLIENT_ORIGIN: z.string().url().default('http://localhost:5173'),
  JWT_SECRET: z.preprocess(emptyToUndefined, z.string().min(32).optional()),
  DATABASE_URL: z.preprocess(emptyToUndefined, z.string().url().optional()),
  LIVEKIT_URL: z.preprocess(emptyToUndefined, z.string().url().optional()),
  LIVEKIT_API_KEY: z.preprocess(emptyToUndefined, z.string().optional()),
  LIVEKIT_API_SECRET: z.preprocess(emptyToUndefined, z.string().optional()),
  // AES-256-GCM key for LLM API keys at rest (docs/05 §8). 16+ chars so the derived key
  // has real entropy; generate with `openssl rand -base64 32`.
  LLM_KEY_ENCRYPTION_SECRET: z.preprocess(emptyToUndefined, z.string().min(16).optional()),

  // --- DEV SHIM (assistant owner) — delete once the Auth owner's JWT middleware lands ---
  // Setting DEV_USER_ID makes `requireAuth` treat every request as that user, so the
  // assistant can be exercised end-to-end before signup/login exist. Refused in production.
  DEV_USER_ID: z.preprocess(emptyToUndefined, z.string().min(1).optional()),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Invalid environment variables:');
  for (const issue of parsed.error.issues) {
    console.error(`  ${issue.path.join('.')}: ${issue.message}`);
  }
  process.exit(1);
}

export const env = parsed.data;
