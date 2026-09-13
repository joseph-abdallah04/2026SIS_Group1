-- When a proposal's artifact was last rewritten (F16). Null for everything
-- proposed so far, which is correct: none of it has been edited since, and a
-- backfill from createdAt would mark every existing card as edited.
ALTER TABLE "proposals" ADD COLUMN "editedAt" TIMESTAMP(3);
