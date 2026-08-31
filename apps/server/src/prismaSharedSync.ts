// Compile-time guard: keeps the Prisma-generated QuestionStatus enum and the
// hand-written union in packages/shared in sync. If either list changes
// without the other, this file fails to typecheck (see docs/06 Coordination
// Point 2 — Session Lifecycle owner defines this value, others just consume it).
import type {
  ProposalType as PrismaProposalType,
  QuestionStatus as PrismaQuestionStatus,
} from './generated/prisma/enums.js';
import type {
  ProposalType as SharedProposalType,
  QuestionStatus as SharedQuestionStatus,
} from '@roundtable/shared';

type AssertEqual<A, B> = [A] extends [B] ? ([B] extends [A] ? true : never) : never;

// Deliberately unused outside this file — its only job is to fail `tsc` if the
// two type unions ever diverge.
export const _questionStatusInSync: AssertEqual<PrismaQuestionStatus, SharedQuestionStatus> = true;

// Same guard for the pinboard's artifact kind (docs/06 Coordination Point 3 —
// artifact shapes are shared between tools, pinboard, and assistant).
export const _proposalTypeInSync: AssertEqual<PrismaProposalType, SharedProposalType> = true;
