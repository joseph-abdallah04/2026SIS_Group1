import { z } from 'zod';

// Pattern for API DTO validation: define the zod schema, export `z.infer` as the type.
// Use on REST bodies (server) and forms (web). Add your module's schemas under its label.

export const signupSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  displayName: z.string().min(1).max(50),
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export type SignupInput = z.infer<typeof signupSchema>;
export type LoginInput = z.infer<typeof loginSchema>;

// === sessions module ===

// F04: title + an ordered list of questions. Order is exactly the array
// order — the server assigns `position` from array index, so reordering
// client-side and resubmitting is how a question list gets reordered.
export const createSessionSchema = z.object({
  title: z.string().trim().min(1).max(120),
  questions: z.array(z.string().trim().min(1).max(500)).min(1).max(50),
});

export type CreateSessionInput = z.infer<typeof createSessionSchema>;

// F06: `XXXX-XXXX` from an alphabet with no `0/1/I/L/O` — nothing that could
// be confused for another character when read aloud or typed. Kept here
// alongside the regex so the alphabet used to generate a code and the one
// used to validate it can never drift apart.
export const SESSION_CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';

export const sessionCodeSchema = z
  .string()
  .regex(/^[2-9A-HJ-NP-Z]{4}-[2-9A-HJ-NP-Z]{4}$/, 'Invalid session code format');

// Looser than `sessionCodeSchema` on purpose: a user might paste
// "k7np3wqz" or "k7np 3wqz" before it's normalised, so this only bounds the
// length. `normalizeSessionCode` (below) does the real work before either
// side compares it against `sessionCodeSchema`.
export const joinSessionSchema = z.object({
  code: z.string().trim().min(1).max(20),
});

export type JoinSessionInput = z.infer<typeof joinSessionSchema>;

// === pinboard module ===

const stickyColorSchema = z.enum(['yellow', 'pink', 'blue', 'green']);

export const stickyArtifactSchema = z.object({
  type: z.literal('sticky'),
  text: z.string().max(2000),
  color: stickyColorSchema,
});

export const drawingArtifactSchema = z.object({
  type: z.literal('drawing'),
  svg: z.string().max(100_000),
});

export const diagramNodeSchema = z.object({
  id: z.string().min(1),
  label: z.string().max(200),
  x: z.number(),
  y: z.number(),
  // Optional so diagrams authored before shapes existed still parse as boxes.
  shape: z.enum(['box', 'container', 'text']).optional(),
});

export const diagramEdgeSchema = z.object({
  from: z.string().min(1),
  to: z.string().min(1),
  label: z.string().max(200).optional(),
});

export const diagramArtifactSchema = z
  .object({
    type: z.literal('diagram'),
    nodes: z.array(diagramNodeSchema).max(100),
    edges: z.array(diagramEdgeSchema).max(200),
  })
  .superRefine(({ nodes, edges }, context) => {
    const nodeIds = new Set<string>();
    nodes.forEach((node, index) => {
      if (nodeIds.has(node.id)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Node ids must be unique',
          path: ['nodes', index, 'id'],
        });
      }
      nodeIds.add(node.id);
    });

    const edgeKeys = new Set<string>();
    edges.forEach((edge, index) => {
      if (!nodeIds.has(edge.from) || !nodeIds.has(edge.to)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Edge endpoints must reference existing nodes',
          path: ['edges', index],
        });
      }
      if (edge.from === edge.to) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Edges must connect different nodes',
          path: ['edges', index],
        });
      }

      const key = JSON.stringify([edge.from, edge.to]);
      if (edgeKeys.has(key)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Duplicate directed edges are not allowed',
          path: ['edges', index],
        });
      }
      edgeKeys.add(key);
    });
  });

// Diagram invariants use `superRefine`; ZodEffects cannot participate in a discriminated union.
export const artifactJsonSchema = z.union([
  stickyArtifactSchema,
  drawingArtifactSchema,
  diagramArtifactSchema,
]);

export const proposalTypeSchema = z.enum(['sticky', 'drawing', 'diagram']);

// Write contract for F15/tools — the column and the artifact must agree, so a
// `sticky` proposal can never carry a diagram payload.
export const proposalCreateSchema = z
  .object({
    type: proposalTypeSchema,
    artifactJson: artifactJsonSchema,
    x: z.number(),
    y: z.number(),
    extendsProposalId: z.string().optional(),
  })
  .refine((v) => v.type === v.artifactJson.type, {
    message: 'type must match artifactJson.type',
    path: ['type'],
  });

export type ProposalCreateInput = z.infer<typeof proposalCreateSchema>;

/**
 * Edit contract for F16. Content, position, or both.
 *
 * Every field is optional because a drag sends only coordinates and a text edit
 * sends only the artifact, but an update that changes nothing is a mistake
 * worth reporting rather than a no-op write.
 *
 * `type` is deliberately absent: a sticky cannot become a diagram. Changing the
 * kind of an artifact would break the column/artifact agreement that
 * `proposalCreateSchema` establishes, and it is not an edit, it is a new idea,
 * which is what proposing (or extending, F23) is for.
 */
export const proposalUpdateSchema = z
  .object({
    id: z.string().min(1),
    artifactJson: artifactJsonSchema.optional(),
    x: z.number().min(0).max(100_000).optional(),
    y: z.number().min(0).max(100_000).optional(),
  })
  .refine((v) => v.artifactJson !== undefined || v.x !== undefined || v.y !== undefined, {
    message: 'An update must change the content or the position',
    path: ['id'],
  });

export type ProposalUpdateInput = z.infer<typeof proposalUpdateSchema>;

export const proposalDeleteSchema = z.object({ id: z.string().min(1) });

export type ProposalDeleteInput = z.infer<typeof proposalDeleteSchema>;
