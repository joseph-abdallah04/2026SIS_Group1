import 'dotenv/config';
import { z } from 'zod';

// Fail-fast env validation. See docs/02-architecture.md §7 (Env/config).
// Keys become required as their owning modules land:
//   - JWT_SECRET        → auth module (Week 1)
//   - DATABASE_URL      → Prisma setup (checklist §4)
//   - LIVEKIT_*         → voice module
//   - LLM_KEY_ENCRYPTION_SECRET → assistant module
const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(3001),
  CLIENT_ORIGIN: z.string().url().default('http://localhost:5173'),
  JWT_SECRET: z.string().min(32).optional(),
  DATABASE_URL: z.string().url().optional(),
  LIVEKIT_URL: z.string().url().optional(),
  LIVEKIT_API_KEY: z.string().optional(),
  LIVEKIT_API_SECRET: z.string().optional(),
  LLM_KEY_ENCRYPTION_SECRET: z.string().optional(),
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
