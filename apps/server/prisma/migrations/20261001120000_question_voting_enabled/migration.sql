-- F41: brainstorm-only questions. True for every existing row, which keeps
-- every question asked so far exactly as it was: until now, every question
-- was one the team voted on.
ALTER TABLE "questions" ADD COLUMN "voting_enabled" BOOLEAN NOT NULL DEFAULT true;
