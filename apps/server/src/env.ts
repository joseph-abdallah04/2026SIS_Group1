import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { config as loadEnvFile } from 'dotenv';
import { z } from 'zod';

// `.env` lives in the monorepo root (docs/05 §2), but npm workspace scripts run with the
// working directory set to apps/server — so `dotenv/config`'s default lookup (cwd/.env)
// misses it and every variable silently reads as undefined. Resolve it from this file's
// location instead, which is stable whether we're running from src/ or dist/.
const here = path.dirname(fileURLToPath(import.meta.url));
loadEnvFile({ path: path.resolve(here, '../../../.env') });
// A per-developer apps/server/.env wins over the shared root file, if one exists.
loadEnvFile({ path: path.resolve(here, '../.env'), override: true });

// Fail-fast env validation. See docs/02-architecture.md §7 (Env/config).
// Keys become required as their owning modules land:
//   - JWT_SECRET        → auth module (Week 1)
//   - DATABASE_URL      → Prisma setup (checklist §4)
//   - LIVEKIT_*         → voice module
//   - LLM_KEY_ENCRYPTION_SECRET → assistant module
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3001),
  CLIENT_ORIGIN: z.string().url().default('http://localhost:5173'),
  JWT_SECRET: z.string().min(32).optional(),
  DATABASE_URL: z.string().url().optional(),
  LIVEKIT_URL: z.string().url().optional(),
  LIVEKIT_API_KEY: z.string().optional(),
  LIVEKIT_API_SECRET: z.string().optional(),
  // AES-256-GCM key for LLM API keys at rest (docs/05 §8). 16+ chars so the derived key
  // has real entropy; generate with `openssl rand -base64 32`.
  LLM_KEY_ENCRYPTION_SECRET: z.string().min(16).optional(),

  // --- DEV SHIM (assistant owner) — delete once the Auth owner's JWT middleware lands ---
  // Setting DEV_USER_ID makes `requireAuth` treat every request as that user, so the
  // assistant can be exercised end-to-end before signup/login exist. Refused in production.
  DEV_USER_ID: z.string().min(1).optional(),
});

// A key left blank in `.env` (`JWT_SECRET=`) means "not configured yet", but dotenv sets it
// to an empty string — which `.optional()` treats as a present value and then rejects for
// being too short / not a URL. Drop empty values so a placeholder line reads as absent, and
// `.env.example` can be copied verbatim before every service has been set up.
const rawEnv = Object.fromEntries(
  Object.entries(process.env).filter(([, value]) => value !== undefined && value.trim() !== ''),
);

const parsed = envSchema.safeParse(rawEnv);

if (!parsed.success) {
  console.error('❌ Invalid environment variables:');
  for (const issue of parsed.error.issues) {
    console.error(`  ${issue.path.join('.')}: ${issue.message}`);
  }
  process.exit(1);
}

export const env = parsed.data;
