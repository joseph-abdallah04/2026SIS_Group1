// Seed dummy users + one demo session for local development (docs/05 §4).
// Usage: `npm run db:seed` from the repo root, or from apps/server.
//
// Importing the server's env module first is what makes both work: it resolves the root
// `.env` by path rather than by working directory, so DATABASE_URL is populated before
// PrismaClient is constructed.
import '../src/env.js';

import { PrismaClient } from '../src/generated/prisma/client.js';

const prisma = new PrismaClient();

// Fixed ids rather than generated cuids: they can be pasted straight into `.env`
// (DEV_USER_ID) and into a URL (/sessions/demo-session-1) while auth and the sessions
// module are still being built.
const ALICE_ID = 'demo-user-alice';
const BOB_ID = 'demo-user-bob';
const DEMO_SESSION_ID = 'demo-session-1';

async function main() {
  const alice = await prisma.user.upsert({
    where: { email: 'alice@example.com' },
    update: {},
    create: {
      id: ALICE_ID,
      email: 'alice@example.com',
      passwordHash: 'seed-only-not-a-real-hash',
      displayName: 'Alice (demo leader)',
    },
  });
  await prisma.user.upsert({
    where: { email: 'bob@example.com' },
    update: {},
    create: {
      id: BOB_ID,
      email: 'bob@example.com',
      passwordHash: 'seed-only-not-a-real-hash',
      displayName: 'Bob (demo participant)',
    },
  });

  await prisma.session.upsert({
    where: { code: 'DEMO-0001' },
    update: {},
    create: {
      id: DEMO_SESSION_ID,
      code: 'DEMO-0001',
      title: 'Demo session (seeded)',
      leaderId: alice.id,
      status: 'lobby',
    },
  });

  console.log('Seeded users:');
  console.log(`  alice@example.com  id=${alice.id}`);
  console.log(`  bob@example.com    id=${BOB_ID}`);
  console.log(`Seeded session DEMO-0001 id=${DEMO_SESSION_ID} → /sessions/${DEMO_SESSION_ID}`);
  console.log(`\nFor local dev without auth, put this in .env:  DEV_USER_ID=${alice.id}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
