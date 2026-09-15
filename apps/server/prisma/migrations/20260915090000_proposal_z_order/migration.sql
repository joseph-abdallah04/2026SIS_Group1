-- Stacking order on the board (bring to front / send to back). Zero for
-- everything proposed so far, which keeps today's stack exactly as it is: equal
-- values fall back to creation order, which is how cards have always painted.
ALTER TABLE "proposals" ADD COLUMN "z" INTEGER NOT NULL DEFAULT 0;
