-- DropForeignKey
ALTER TABLE "proposals" DROP CONSTRAINT "proposals_authorId_fkey";

-- DropForeignKey
ALTER TABLE "sessions" DROP CONSTRAINT "sessions_leaderId_fkey";

-- AlterTable
ALTER TABLE "proposals" ALTER COLUMN "authorId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "sessions" ALTER COLUMN "leaderId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_leaderId_fkey" FOREIGN KEY ("leaderId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proposals" ADD CONSTRAINT "proposals_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
