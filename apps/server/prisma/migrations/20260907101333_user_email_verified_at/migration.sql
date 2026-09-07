-- AlterTable
ALTER TABLE "users" ADD COLUMN     "emailVerifiedAt" TIMESTAMP(3);

-- Grandfather in every account that existed before email verification was
-- required — the requirement didn't exist when they signed up, so treating
-- them as unverified would lock every existing account (including seed data)
-- out of login the moment this migration runs.
UPDATE "users" SET "emailVerifiedAt" = "createdAt" WHERE "emailVerifiedAt" IS NULL;
