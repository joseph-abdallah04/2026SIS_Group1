-- F27: question-scoped voting rounds replace the unused session-scoped shortlist.

CREATE TYPE "VotingRoundStatus" AS ENUM ('shortlisting', 'open', 'closed');

DROP TABLE IF EXISTS "session_shortlist";

CREATE TABLE "voting_rounds" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "status" "VotingRoundStatus" NOT NULL DEFAULT 'shortlisting',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),

    CONSTRAINT "voting_rounds_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "voting_shortlist_items" (
    "id" TEXT NOT NULL,
    "roundId" TEXT NOT NULL,
    "proposalId" TEXT NOT NULL,

    CONSTRAINT "voting_shortlist_items_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "voting_rounds_questionId_key" ON "voting_rounds"("questionId");
CREATE INDEX "voting_rounds_sessionId_idx" ON "voting_rounds"("sessionId");
CREATE UNIQUE INDEX "voting_shortlist_items_roundId_proposalId_key" ON "voting_shortlist_items"("roundId", "proposalId");

ALTER TABLE "voting_rounds" ADD CONSTRAINT "voting_rounds_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "voting_rounds" ADD CONSTRAINT "voting_rounds_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "voting_shortlist_items" ADD CONSTRAINT "voting_shortlist_items_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "voting_rounds"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "voting_shortlist_items" ADD CONSTRAINT "voting_shortlist_items_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "proposals"("id") ON DELETE CASCADE ON UPDATE CASCADE;
