// Seed dummy users + one demo session for local development (docs/05 §4).
// Usage (from apps/server): npx tsx prisma/seed.ts
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { PrismaClient } from '../src/generated/prisma/client.js';

const here = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(here, '../../../.env') });
dotenv.config({ path: path.resolve(here, '../../.env') });


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

  const question = await prisma.question.upsert({
    where: { id: `${session.id}-q1` },
    update: { status: 'discussion' },
    create: {
      id: `${session.id}-q1`,
      sessionId: session.id,
      text: 'What should we build first?',
      position: 0,
      status: 'discussion',
    },
  });

  await prisma.proposal.deleteMany({ where: { questionId: question.id } });

  await prisma.proposal.createMany({
    data: [
      {
        questionId: question.id,
        authorId: alice.id,
        type: 'sticky',
        artifactJson: {
          type: 'sticky',
          text: 'Start with the shared pinboard canvas',
          color: 'yellow',
        },
        x: 80,
        y: 60,
      },
      {
        questionId: question.id,
        authorId: bob.id,
        type: 'drawing',
        artifactJson: {
          type: 'drawing',
          svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 80"><circle cx="35" cy="40" r="24" fill="#60a5fa"/><rect x="60" y="20" width="48" height="40" rx="4" fill="#f472b6"/></svg>',
        },
        x: 320,
        y: 80,
      },
      {
        questionId: question.id,
        authorId: alice.id,
        type: 'diagram',
        artifactJson: {
          type: 'diagram',
          nodes: [
            { id: 'idea', label: 'Idea', x: 20, y: 30 },
            { id: 'vote', label: 'Vote', x: 140, y: 30 },
            { id: 'answer', label: 'Answer', x: 260, y: 30 },
          ],
          edges: [
            { from: 'idea', to: 'vote' },
            { from: 'vote', to: 'answer' },
          ],
        },
        x: 120,
        y: 280,
      },
    ],
  });

  console.log('Seeded: alice@example.com, bob@example.com');
  console.log(`Demo session: ${session.id} (code ${session.code})`);
  console.log(`Open: /sessions/${session.id}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
