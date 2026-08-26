// Seed dummy users + one demo session for local development (docs/05 §4).
// Usage (from apps/server): npx tsx prisma/seed.ts
import { PrismaClient } from '../src/generated/prisma/client.js';

const prisma = new PrismaClient();

async function main() {
  const alice = await prisma.user.upsert({
    where: { email: 'alice@example.com' },
    update: {},
    create: {
      email: 'alice@example.com',
      passwordHash: 'seed-only-not-a-real-hash',
      displayName: 'Alice (demo leader)',
    },
  });
  await prisma.user.upsert({
    where: { email: 'bob@example.com' },
    update: {},
    create: {
      email: 'bob@example.com',
      passwordHash: 'seed-only-not-a-real-hash',
      displayName: 'Bob (demo participant)',
    },
  });

  await prisma.session.upsert({
    where: { code: 'DEMO-0001' },
    update: {},
    create: {
      code: 'DEMO-0001',
      title: 'Demo session (seeded)',
      leaderId: alice.id,
      status: 'lobby',
    },
  });

  console.log('Seeded: alice@example.com, bob@example.com, session DEMO-0001');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
