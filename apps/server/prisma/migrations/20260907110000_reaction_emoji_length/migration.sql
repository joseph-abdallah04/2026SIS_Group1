-- Match the column to MAX_REACTION_LENGTH in packages/shared, so the widest
-- single emoji still fits and nothing longer can be stored even if a future
-- caller skips the `isEmoji` guard.
ALTER TABLE "proposal_reactions" ALTER COLUMN "emoji" SET DATA TYPE VARCHAR(32);
