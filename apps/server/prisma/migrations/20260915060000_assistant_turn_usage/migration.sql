-- Per-turn token accounting for the assistant.
--
-- Token columns are nullable: whether usage is reported at all is the provider's choice,
-- and NULL ("not reported") must stay distinguishable from 0 ("free").
CREATE TABLE "assistant_turn_usage" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "providerHost" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "inputTokens" INTEGER,
    "outputTokens" INTEGER,
    "totalTokens" INTEGER,
    "reasoningTokens" INTEGER,
    "cachedInputTokens" INTEGER,
    "steps" INTEGER NOT NULL,
    "durationMs" INTEGER NOT NULL,
    "outcome" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "assistant_turn_usage_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "assistant_turn_usage_userId_createdAt_idx" ON "assistant_turn_usage"("userId", "createdAt");

CREATE INDEX "assistant_turn_usage_sessionId_idx" ON "assistant_turn_usage"("sessionId");

ALTER TABLE "assistant_turn_usage"
    ADD CONSTRAINT "assistant_turn_usage_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
