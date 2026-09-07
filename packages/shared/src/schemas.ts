import { z } from 'zod';

import {
  DRAWING_ARTIFACT_LIMIT,
  DRAWING_INK_KEYS,
  DRAWING_PEN_WIDTHS,
  DRAWING_VIEWBOX_HEIGHT,
  DRAWING_VIEWBOX_WIDTH,
} from './drawingContract.js';
import { isEmoji, MAX_REACTION_LENGTH } from './reactionContract.js';
import {
  DIAGRAM_FILL_KEYS,
  DIAGRAM_NODE_SHAPE_KEYS,
  DIAGRAM_FONT_SIZE_PRESETS,
  DIAGRAM_MAX_NODE_HEIGHT,
  DIAGRAM_MAX_NODE_WIDTH,
  DIAGRAM_MIN_NODE_HEIGHT,
  DIAGRAM_MIN_NODE_WIDTH,
  DIAGRAM_STROKE_KEYS,
  DIAGRAM_STROKE_STYLES,
  DIAGRAM_STROKE_WIDTH_PRESETS,
  diagramCanParent,
} from './diagramContract.js';

// Pattern for API DTO validation: define the zod schema, export `z.infer` as the type.
// Use on REST bodies (server) and forms (web). Add your module's schemas under its label.

export const signupSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  displayName: z.string().trim().min(1).max(50),
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const updateProfileSchema = z.object({
  displayName: z.string().trim().min(1).max(50),
});

export const verifyEmailQuerySchema = z.object({
  token: z.string().min(1),
});

export const resendVerificationSchema = z.object({
  email: z.string().email(),
});

export type SignupInput = z.infer<typeof signupSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
export type VerifyEmailQuery = z.infer<typeof verifyEmailQuerySchema>;
export type ResendVerificationInput = z.infer<typeof resendVerificationSchema>;

// === sessions module ===

// F04: title + an ordered list of questions. Order is exactly the array
// order — the server assigns `position` from array index, so reordering
// client-side and resubmitting is how a question list gets reordered.
export const createSessionSchema = z.object({
  title: z.string().trim().min(1).max(120),
  questions: z.array(z.string().trim().min(1).max(500)).min(1).max(50),
});

export type CreateSessionInput = z.infer<typeof createSessionSchema>;

// F05: editing a draft replaces title + the full question list in one call
// (no partial-field PATCH semantics) — same shape as creating one, since a
// draft's questions have no other state yet for a partial update to preserve.
export const updateSessionSchema = createSessionSchema;
export type UpdateSessionInput = z.infer<typeof updateSessionSchema>;

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

// F25/F26: the leader moving one question through the agenda. `pending` is
// absent on purpose — it is the state a question is *created* in and nothing
// may return to it, so "un-start a discussion" is not expressible. The rest of
// the machine (which status may follow which) is enforced server-side in
// `setQuestionPhase`; this only bounds the shape.
export const setQuestionPhaseSchema = z.object({
  questionId: z.string().min(1),
  status: z.enum(['discussion', 'voting', 'answered', 'skipped']),
});

export type SetQuestionPhaseInput = z.infer<typeof setQuestionPhaseSchema>;

// Leader pointing the board at a question without changing its status — so
// an answered question's pinboard can be shown again without reopening it.
export const focusQuestionSchema = z.object({
  questionId: z.string().min(1),
});

export type FocusQuestionInput = z.infer<typeof focusQuestionSchema>;

// === pinboard module ===

const stickyColorSchema = z.enum(['yellow', 'pink', 'blue', 'green']);

export const stickyArtifactSchema = z.object({
  type: z.literal('sticky'),
  text: z.string().max(2000),
  color: stickyColorSchema,
});

/**
 * A stroke as stored: which pen, and a flat list of coordinates.
 *
 * Coordinates are bounded by the drawing's own viewBox with a little tolerance
 * either side, since the editor clamps to the surface but a stroke may sit
 * exactly on an edge.
 */
const drawingStrokeSchema = z.object({
  ink: z.enum(DRAWING_INK_KEYS),
  width: z.union([
    z.literal(DRAWING_PEN_WIDTHS[0]),
    z.literal(DRAWING_PEN_WIDTHS[1]),
    z.literal(DRAWING_PEN_WIDTHS[2]),
  ]),
  points: z
    .array(
      z
        .number()
        .min(-1)
        .max(Math.max(DRAWING_VIEWBOX_WIDTH, DRAWING_VIEWBOX_HEIGHT) + 1),
    )
    .max(4000),
});

/**
 * Read shape, deliberately forgiving about the strokes.
 *
 * A stored row may carry strokes written by a build that knew inks or widths
 * this one does not. The SVG renders regardless, so an unreadable stroke list
 * costs the ability to edit that drawing, not the ability to see it — the same
 * bargain the diagram's lenient read makes.
 */
export const drawingArtifactSchema = z.object({
  type: z.literal('drawing'),
  svg: z.string().max(DRAWING_ARTIFACT_LIMIT),
  strokes: z.array(drawingStrokeSchema).max(600).optional().catch(undefined),
});

/** Write shape: strokes must be ones this build understands, or absent. */
const drawingStrictArtifactSchema = z.object({
  type: z.literal('drawing'),
  svg: z.string().max(DRAWING_ARTIFACT_LIMIT),
  strokes: z.array(drawingStrokeSchema).max(600).optional(),
});

export const drawingWriteArtifactSchema = drawingStrictArtifactSchema.superRefine(
  (value, context) => {
    // The budget covers the whole artifact. Checking the parts separately would
    // let a drawing through that is under the cap twice over but not once.
    const size = value.svg.length + (value.strokes ? JSON.stringify(value.strokes).length : 0);
    if (size > DRAWING_ARTIFACT_LIMIT) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'This sketch is too detailed to store',
        path: ['svg'],
      });
    }
  },
);

const diagramFillKeySchema = z.enum(DIAGRAM_FILL_KEYS);
const diagramStrokeKeySchema = z.enum(DIAGRAM_STROKE_KEYS);
const diagramStrokeWidthPresetSchema = z.enum(DIAGRAM_STROKE_WIDTH_PRESETS);
const diagramFontSizePresetSchema = z.enum(DIAGRAM_FONT_SIZE_PRESETS);
const diagramStrokeStyleSchema = z.enum(DIAGRAM_STROKE_STYLES);

// The strict node, used on the write path. Size bounds, the width/height pair
// rule and the container rules are added on top in diagramWriteArtifactSchema.
export const diagramNodeSchema = z.object({
  id: z.string().min(1),
  label: z.string().max(200),
  x: z.number(),
  y: z.number(),
  // Optional so diagrams authored before shapes existed still parse as boxes.
  shape: z.enum(DIAGRAM_NODE_SHAPE_KEYS).optional(),
  // v3 semantic grouping; the container rules are write-path invariants.
  parentId: z.string().min(1).optional(),
  // v2, all optional: absent means the pre-v2 appearance.
  width: z.number().optional(),
  height: z.number().optional(),
  fillColor: diagramFillKeySchema.optional(),
  strokeColor: diagramStrokeKeySchema.optional(),
  strokeWidthPreset: diagramStrokeWidthPresetSchema.optional(),
  fontSizePreset: diagramFontSizePresetSchema.optional(),
});

export const diagramEdgeSchema = z.object({
  from: z.string().min(1),
  to: z.string().min(1),
  label: z.string().max(200).optional(),
  strokeColor: diagramStrokeKeySchema.optional(),
  strokeWidthPreset: diagramStrokeWidthPresetSchema.optional(),
  strokeStyle: diagramStrokeStyleSchema.optional(),
});

/**
 * Reading is deliberately more forgiving than writing.
 *
 * A stored row was written by some past or future build of this app. If it
 * carries a value this build does not recognise — a palette key or shape added
 * later, a size that is no longer in range — the node must still load with its
 * default appearance rather than taking the whole board down with it. Only the
 * write path decides what is allowed to be created, and it stays strict.
 *
 * This is the same rule that already applies to legacy dangling edges.
 */
function lenient<T extends z.ZodTypeAny>(schema: T) {
  return schema.optional().catch(undefined);
}

const diagramReadNodeSchema = diagramNodeSchema.extend({
  shape: lenient(z.enum(DIAGRAM_NODE_SHAPE_KEYS)),
  parentId: lenient(z.string().min(1)),
  width: lenient(z.number()),
  height: lenient(z.number()),
  fillColor: lenient(diagramFillKeySchema),
  strokeColor: lenient(diagramStrokeKeySchema),
  strokeWidthPreset: lenient(diagramStrokeWidthPresetSchema),
  fontSizePreset: lenient(diagramFontSizePresetSchema),
});

const diagramReadEdgeSchema = diagramEdgeSchema.extend({
  strokeColor: lenient(diagramStrokeKeySchema),
  strokeWidthPreset: lenient(diagramStrokeWidthPresetSchema),
  strokeStyle: lenient(diagramStrokeStyleSchema),
});

/** Read shape. Stays a plain object so it can join a discriminated union. */
export const diagramArtifactSchema = z.object({
  type: z.literal('diagram'),
  nodes: z.array(diagramReadNodeSchema).max(100),
  edges: z.array(diagramReadEdgeSchema).max(200),
});

/** Write shape: every field must be one this build actually understands. */
const diagramStrictArtifactSchema = z.object({
  type: z.literal('diagram'),
  nodes: z.array(diagramNodeSchema).max(100),
  edges: z.array(diagramEdgeSchema).max(200),
});

export const diagramWriteArtifactSchema = diagramStrictArtifactSchema.superRefine(
  ({ nodes, edges }, context) => {
    const shapeById = new Map(nodes.map((node) => [node.id, node.shape]));

    nodes.forEach((node, index) => {
      if (node.parentId === undefined) return;
      if (node.parentId === node.id) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'A node cannot be its own parent',
          path: ['nodes', index, 'parentId'],
        });
        return;
      }
      if (!shapeById.has(node.parentId)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'parentId must reference an existing node',
          path: ['nodes', index, 'parentId'],
        });
        return;
      }
      if (!diagramCanParent(shapeById.get(node.parentId))) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Only container nodes can hold children',
          path: ['nodes', index, 'parentId'],
        });
      }
    });

    // Walk each parent chain; a repeat means the grouping graph has a cycle.
    const parentById = new Map(nodes.map((node) => [node.id, node.parentId]));
    nodes.forEach((node, index) => {
      const seen = new Set<string>([node.id]);
      let current = parentById.get(node.id);
      while (current !== undefined && parentById.has(current)) {
        if (seen.has(current)) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'Container nesting must not contain a cycle',
            path: ['nodes', index, 'parentId'],
          });
          return;
        }
        seen.add(current);
        current = parentById.get(current);
      }
    });

    const nodeIds = new Set<string>();
    nodes.forEach((node, index) => {
      const hasWidth = node.width !== undefined;
      const hasHeight = node.height !== undefined;
      if (hasWidth !== hasHeight) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Node width and height must be set together',
          path: ['nodes', index, hasWidth ? 'height' : 'width'],
        });
      }
      if (
        hasWidth &&
        (node.width! < DIAGRAM_MIN_NODE_WIDTH || node.width! > DIAGRAM_MAX_NODE_WIDTH)
      ) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Node width must be between ${DIAGRAM_MIN_NODE_WIDTH} and ${DIAGRAM_MAX_NODE_WIDTH}`,
          path: ['nodes', index, 'width'],
        });
      }
      if (
        hasHeight &&
        (node.height! < DIAGRAM_MIN_NODE_HEIGHT || node.height! > DIAGRAM_MAX_NODE_HEIGHT)
      ) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Node height must be between ${DIAGRAM_MIN_NODE_HEIGHT} and ${DIAGRAM_MAX_NODE_HEIGHT}`,
          path: ['nodes', index, 'height'],
        });
      }

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
  },
);

/** What a stored row is parsed with: tolerant of values it does not recognise. */
export const artifactJsonSchema = z.discriminatedUnion('type', [
  stickyArtifactSchema,
  drawingArtifactSchema,
  diagramArtifactSchema,
]);

/**
 * What an incoming payload is parsed with. This deliberately does NOT reuse
 * `artifactJsonSchema`: that one strips values it does not recognise, which
 * would quietly launder a crafted payload into a valid one before the write
 * invariants ever ran.
 */
export const artifactWriteJsonSchema = z.discriminatedUnion('type', [
  stickyArtifactSchema,
  drawingStrictArtifactSchema,
  diagramStrictArtifactSchema,
]);

export const proposalTypeSchema = z.enum(['sticky', 'drawing', 'diagram']);

// Write contract for F15/tools — the column and the artifact must agree, so a
// `sticky` proposal can never carry a diagram payload.
export const proposalCreateSchema = z
  .object({
    type: proposalTypeSchema,
    artifactJson: artifactWriteJsonSchema,
    x: z.number(),
    y: z.number(),
    extendsProposalId: z.string().optional(),
  })
  .superRefine((value, context) => {
    if (value.type !== value.artifactJson.type) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'type must match artifactJson.type',
        path: ['type'],
      });
    }

    // Per-kind write rules, stricter than the read union: reading tolerates
    // values it does not recognise, writing decides what may exist.
    const writeSchema =
      value.artifactJson.type === 'diagram'
        ? diagramWriteArtifactSchema
        : value.artifactJson.type === 'drawing'
          ? drawingWriteArtifactSchema
          : null;

    if (writeSchema) {
      const parsed = writeSchema.safeParse(value.artifactJson);
      if (!parsed.success) {
        for (const issue of parsed.error.issues) {
          context.addIssue({ ...issue, path: ['artifactJson', ...issue.path] });
        }
      }
    }
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
    // The strict union, like `proposalCreate`: an edit is a write, so it faces
    // exactly the same contract a create does. Parsing with the tolerant read
    // union here would let an edit quietly launder a payload past the rules.
    artifactJson: artifactWriteJsonSchema.optional(),
    x: z.number().min(0).max(100_000).optional(),
    y: z.number().min(0).max(100_000).optional(),
  })
  .superRefine((value, context) => {
    if (value.artifactJson === undefined && value.x === undefined && value.y === undefined) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'An update must change the content or the position',
        path: ['id'],
      });
    }

    // Per-kind write rules — diagram graph and grouping invariants, drawing
    // stroke and size limits — apply to every write path, not just creation.
    const writeSchema =
      value.artifactJson?.type === 'diagram'
        ? diagramWriteArtifactSchema
        : value.artifactJson?.type === 'drawing'
          ? drawingWriteArtifactSchema
          : null;

    if (writeSchema && value.artifactJson) {
      const parsed = writeSchema.safeParse(value.artifactJson);
      if (!parsed.success) {
        for (const issue of parsed.error.issues) {
          context.addIssue({ ...issue, path: ['artifactJson', ...issue.path] });
        }
      }
    }
  });

export type ProposalUpdateInput = z.infer<typeof proposalUpdateSchema>;

export const proposalDeleteSchema = z.object({ id: z.string().min(1) });

export type ProposalDeleteInput = z.infer<typeof proposalDeleteSchema>;

/**
 * Toggle contract for F18.
 *
 * One intent for both directions: the client says which reaction it means, and
 * the server decides whether that adds or removes one by looking at what is
 * already stored. A separate "unreact" would let a client that had lost track
 * of its own state ask for a removal that never happened, and two intents
 * racing each other could leave the reaction on or off depending on arrival
 * order rather than on how many times it was pressed.
 *
 * Any single emoji may be left, not only the three a card offers as chips: the
 * quick set is a shortcut, and a room that wants to react with a party popper
 * should not be told which feelings are available. What is checked is that the
 * value really is one emoji, because this column is otherwise a free-text
 * field of fixed width sitting in the middle of every card.
 */
export const proposalReactSchema = z.object({
  id: z.string().min(1),
  emoji: z
    .string()
    .max(MAX_REACTION_LENGTH)
    .refine(isEmoji, { message: 'A reaction must be a single emoji' }),
});

export type ProposalReactInput = z.infer<typeof proposalReactSchema>;
