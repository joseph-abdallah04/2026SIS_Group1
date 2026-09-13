-- DropForeignKey
ALTER TABLE "session_members" DROP CONSTRAINT "session_members_userId_fkey";

-- DropForeignKey
ALTER TABLE "votes" DROP CONSTRAINT "votes_voterId_fkey";

-- AlterTable
ALTER TABLE "session_members" ALTER COLUMN "userId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "votes" ALTER COLUMN "voterId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "session_members" ADD CONSTRAINT "session_members_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "votes" ADD CONSTRAINT "votes_voterId_fkey" FOREIGN KEY ("voterId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
