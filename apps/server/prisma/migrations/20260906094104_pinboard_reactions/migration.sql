-- CreateTable
CREATE TABLE "proposal_reactions" (
    "id" TEXT NOT NULL,
    "proposalId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "emoji" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "proposal_reactions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "proposal_reactions_proposalId_createdAt_idx" ON "proposal_reactions"("proposalId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "proposal_reactions_proposalId_userId_emoji_key" ON "proposal_reactions"("proposalId", "userId", "emoji");

-- AddForeignKey
ALTER TABLE "proposal_reactions" ADD CONSTRAINT "proposal_reactions_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "proposals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proposal_reactions" ADD CONSTRAINT "proposal_reactions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
