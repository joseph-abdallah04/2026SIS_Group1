-- CreateEnum
CREATE TYPE "SessionStatus" AS ENUM ('lobby', 'active', 'ended');

-- CreateEnum
CREATE TYPE "QuestionStatus" AS ENUM ('pending', 'discussion', 'voting', 'answered', 'skipped');

-- AlterTable
-- Hand-edited (docs/06 migration review): Prisma's default here drops and
-- recreates `status`, which would reset every existing row to 'lobby'. Cast
-- the existing text values into the new enum instead, so real 'active'/'ended'
-- sessions keep their status when this runs against Neon's real data.
ALTER TABLE "sessions" ADD COLUMN "endedAt" TIMESTAMP(3);
ALTER TABLE "sessions" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "sessions" ALTER COLUMN "status" TYPE "SessionStatus" USING ("status"::"SessionStatus");
ALTER TABLE "sessions" ALTER COLUMN "status" SET DEFAULT 'lobby';

-- CreateTable
CREATE TABLE "questions" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "status" "QuestionStatus" NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "questions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "session_members" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "session_members_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "questions_sessionId_position_idx" ON "questions"("sessionId", "position");

-- CreateIndex
CREATE INDEX "session_members_userId_idx" ON "session_members"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "session_members_sessionId_userId_key" ON "session_members"("sessionId", "userId");

-- AddForeignKey
ALTER TABLE "questions" ADD CONSTRAINT "questions_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_members" ADD CONSTRAINT "session_members_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_members" ADD CONSTRAINT "session_members_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
