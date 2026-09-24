-- Imported pictures as proposals of their own. Additive: every existing row is
-- one of the three kinds that were already here, and stays that kind.
ALTER TYPE "ProposalType" ADD VALUE 'image';
