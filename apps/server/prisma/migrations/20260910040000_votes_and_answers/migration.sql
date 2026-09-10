-- F28/F30: one ballot per member per round, and the question's declared answer.

CREATE TABLE "votes" (
    "id" TEXT NOT NULL,
    "roundId" TEXT NOT NULL,
    "voterId" TEXT NOT NULL,
    "proposalId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "votes_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "votes_roundId_voterId_key" ON "votes"("roundId", "voterId");
CREATE INDEX "votes_roundId_proposalId_idx" ON "votes"("roundId", "proposalId");

ALTER TABLE "votes" ADD CONSTRAINT "votes_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "voting_rounds"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "votes" ADD CONSTRAINT "votes_voterId_fkey" FOREIGN KEY ("voterId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "votes" ADD CONSTRAINT "votes_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "proposals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "answers" (
    "id" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "winningProposalId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "answers_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "answers_questionId_key" ON "answers"("questionId");

ALTER TABLE "answers" ADD CONSTRAINT "answers_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "answers" ADD CONSTRAINT "answers_winningProposalId_fkey" FOREIGN KEY ("winningProposalId") REFERENCES "proposals"("id") ON DELETE SET NULL ON UPDATE CASCADE;
