-- One reaction per person per proposal (F18), rather than one per emoji. A
-- reaction says how somebody feels about an idea, and a person has one feeling
-- about it at a time.

-- Anyone who left several on the same proposal keeps their first, since that
-- is the one they chose before the rule existed. Done before the constraint,
-- which would otherwise refuse to be created.
DELETE FROM "proposal_reactions" a
USING "proposal_reactions" b
WHERE a."proposalId" = b."proposalId"
  AND a."userId" = b."userId"
  AND (b."createdAt", b."id") < (a."createdAt", a."id");

DROP INDEX "proposal_reactions_proposalId_userId_emoji_key";

CREATE UNIQUE INDEX "proposal_reactions_proposalId_userId_key"
  ON "proposal_reactions"("proposalId", "userId");
