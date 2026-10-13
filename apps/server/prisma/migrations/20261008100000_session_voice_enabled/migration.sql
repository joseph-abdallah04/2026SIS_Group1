-- Live call / no call. Every session before this was created with a call, so
-- existing rows are backfilled to true and keep theirs. New sessions default
-- to no call: the column default flips to false only after the backfill.
ALTER TABLE "sessions" ADD COLUMN "voice_enabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "sessions" ALTER COLUMN "voice_enabled" SET DEFAULT false;
