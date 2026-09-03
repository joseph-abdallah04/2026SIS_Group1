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
    // `active`, not `lobby`: it seeds a question already in `discussion` with
    // proposals on it, which is what a live session looks like. `/sessions/:id`
    // routes by status (F08), so `lobby` here would land on the waiting room
    // instead of the pinboard this seed exists to exercise. Set on `update`
    // too, so a re-seed of an existing local database picks up this change —
    // an `update: {}` would silently leave an already-seeded row at `lobby`.
    update: { status: 'active' },
    create: {
      code: 'DEMO-0001',
      title: 'Demo session (seeded)',
      leaderId: alice.id,
      status: 'active',
    },
  });

  // Fixed ids so re-running the seed stays idempotent (upsert needs a unique key).
  // `update: {}` on purpose: question status is session-owned state, and a
  // re-seed must not reset a question the sessions phase machine has moved on.
  const question1 = await prisma.question.upsert({
    where: { id: 'seed-question-1' },
    update: {},
    create: {
      id: 'seed-question-1',
      sessionId: session.id,
      text: 'What are our core features for the MVP?',
      position: 0,
      status: 'discussion',
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

  await prisma.proposal.deleteMany({ where: { questionId: question1.id } });

  await prisma.proposal.createMany({
    data: [
      {
        questionId: question1.id,
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
        questionId: question1.id,
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
        questionId: question1.id,
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

  console.log(
    'Seeded: alice@example.com, bob@example.com, session DEMO-0001 (2 questions, 2 members, 3 proposals)',
  );
  console.log(`Open: /sessions/${session.id}`);
  // Paste either id into the dashboard's dev identity box (rt_dev_user_id) —
  // there is no login yet, so this is how a REST request or socket says who
  // it is acting as.
  console.log(`Dev identity — alice (leader): ${alice.id}`);
  console.log(`Dev identity — bob (participant): ${bob.id}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
