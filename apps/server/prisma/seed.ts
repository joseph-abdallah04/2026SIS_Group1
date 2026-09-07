// Seed dummy users + one demo session for local development (docs/05 §4).
// Usage (from apps/server): npx tsx prisma/seed.ts
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import { PrismaClient } from '../src/generated/prisma/client.js';

const here = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(here, '../../../.env') });
dotenv.config({ path: path.resolve(here, '../../.env') });

const prisma = new PrismaClient();

/**
 * The password both demo accounts share. Real bcrypt hashes, not a placeholder
 * string: now that login is real (F01/F02), a seeded user who cannot log in is
 * a seeded user nobody can act as — and testing a session needs two people in
 * two browser windows.
 *
 * Rounds are bcrypt's own default rather than a copy of the auth service's
 * constant; a hash records the cost it was made with, so `bcrypt.compare`
 * verifies these regardless of what the service later uses.
 */
const DEMO_PASSWORD = 'roundtable';

async function main() {
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);

  // `passwordHash` is set on `update` too, so re-seeding a database that was
  // seeded before login existed replaces the unusable placeholder hash — an
  // `update: {}` would leave those accounts permanently unable to log in.
  const alice = await prisma.user.upsert({
    where: { email: 'alice@example.com' },
    update: { passwordHash },
    create: {
      email: 'alice@example.com',
      passwordHash,
      displayName: 'Alice (demo leader)',
    },
  });
  const bob = await prisma.user.upsert({
    where: { email: 'bob@example.com' },
    update: { passwordHash },
    create: {
      email: 'bob@example.com',
      passwordHash,
      displayName: 'Bob (demo participant)',
    },
  });

  const session = await prisma.session.upsert({
    where: { code: 'DEMO-0001' },
    // `ended`, not `active`: an active seeded session is a live membership
    // for both demo accounts, so login's dashboard lock-in dumps whoever
    // signs in straight onto that board instead of the dashboard. Keep the
    // code so this upsert still finds the row; ended sessions are history,
    // not something you are *in*.
    update: { status: 'ended', endedAt: new Date() },
    create: {
      code: 'DEMO-0001',
      title: 'Demo session (seeded)',
      leaderId: alice.id,
      status: 'ended',
      endedAt: new Date(),
    },
  });

  // Fixed ids so re-running the seed stays idempotent (upsert needs a unique key).
  // Statuses are reset on update so a leftover live agenda (answered questions
  // still sitting on an `active` row from an older seed) cannot survive a
  // re-seed and lock someone into an empty "Agenda complete" board.
  const question1 = await prisma.question.upsert({
    where: { id: 'seed-question-1' },
    update: { status: 'answered' },
    create: {
      id: 'seed-question-1',
      sessionId: session.id,
      text: 'What are our core features for the MVP?',
      position: 0,
      status: 'answered',
    },
  });
  await prisma.question.upsert({
    where: { id: 'seed-question-2' },
    update: { status: 'pending' },
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
    'Seeded: alice@example.com, bob@example.com, ended session DEMO-0001 (history — login lands on the dashboard)',
  );
  console.log(`History: /sessions/${session.id}`);
  console.log(
    `Log in at /login as alice@example.com (leader) or bob@example.com — password: ${DEMO_PASSWORD}`,
  );
  console.log(`  alice: ${alice.id}\n  bob:   ${bob.id}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
