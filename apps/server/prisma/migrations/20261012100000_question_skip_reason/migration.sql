-- Why a question was skipped, when the leader gave a reason. Null for every
-- existing row: nothing skipped so far was given one.
ALTER TABLE "questions" ADD COLUMN "skip_reason" TEXT;
