-- AlterEnum
-- Hand-edited: a bare `ADD VALUE` appends, which would leave the database's
-- enum order as lobby, active, ended, draft even though the lifecycle (and
-- the schema file) reads draft first. `BEFORE` keeps the two in agreement.
ALTER TYPE "SessionStatus" ADD VALUE 'draft' BEFORE 'lobby';

-- AlterTable
ALTER TABLE "sessions" ALTER COLUMN "code" DROP NOT NULL;
