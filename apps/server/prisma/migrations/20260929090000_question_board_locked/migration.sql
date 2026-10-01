-- Board lock: whether only the leader may move proposals around a question's
-- board. Per question, so every question starts locked: the leader unlocks the
-- one being discussed when they want members arranging their own cards.
-- Existing questions are locked too, which is the new default for everyone.
ALTER TABLE "questions" ADD COLUMN "board_locked" BOOLEAN NOT NULL DEFAULT true;
