-- AlterTable
ALTER TABLE "sessions" ADD COLUMN "discussion_timer_seconds" INTEGER;
ALTER TABLE "sessions" ADD COLUMN "voting_timer_seconds" INTEGER;

-- AlterTable
ALTER TABLE "questions" ADD COLUMN "discussion_started_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "voting_rounds" ADD COLUMN "opened_at" TIMESTAMP(3);
