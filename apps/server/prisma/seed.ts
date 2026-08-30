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
  const bob = await prisma.user.upsert({
    where: { email: 'bob@example.com' },
    update: {},
    create: {
      email: 'bob@example.com',
      passwordHash: 'seed-only-not-a-real-hash',
      displayName: 'Bob (demo participant)',
    },
  });

  const session = await prisma.session.upsert({
    where: { code: 'DEMO-0001' },
    update: {},
    create: {
      code: 'DEMO-0001',
      title: 'Demo session (seeded)',
      leaderId: alice.id,
      status: 'lobby',
    },
  });

  // Fixed ids so re-running the seed stays idempotent (upsert needs a unique key).
  await prisma.question.upsert({
    where: { id: 'seed-question-1' },
    update: {},
    create: {
      id: 'seed-question-1',
      sessionId: session.id,
      text: 'What are our core features for the MVP?',
      position: 0,
      status: 'pending',
    },
  });
  await prisma.question.upsert({
    where: { id: 'seed-question-2' },
    update: {},
    create: {
      id: 'seed-question-2',
      sessionId: session.id,
      text: 'Which tech stack should we commit to?',
      position: 1,
      status: 'pending',
    },
  });

  for (const user of [alice, bob]) {
    await prisma.sessionMember.upsert({
      where: { sessionId_userId: { sessionId: session.id, userId: user.id } },
      update: {},
      create: { sessionId: session.id, userId: user.id },
    });
  }

  console.log(
    'Seeded: alice@example.com, bob@example.com, session DEMO-0001 (2 questions, 2 members)',
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
