-- CreateTable
CREATE TABLE "session_shortlist" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "proposalId" TEXT NOT NULL,

    CONSTRAINT "session_shortlist_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "session_shortlist" ADD CONSTRAINT "session_shortlist_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_shortlist" ADD CONSTRAINT "session_shortlist_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "proposals"("id") ON DELETE CASCADE ON UPDATE CASCADE;
