import { z } from 'zod';

import {
  DIAGRAM_FILL_KEYS,
  DIAGRAM_FONT_SIZE_PRESETS,
  DIAGRAM_MAX_NODE_HEIGHT,
  DIAGRAM_MAX_NODE_WIDTH,
  DIAGRAM_MIN_NODE_HEIGHT,
  DIAGRAM_MIN_NODE_WIDTH,
  DIAGRAM_STROKE_KEYS,
  DIAGRAM_STROKE_STYLES,
  DIAGRAM_STROKE_WIDTH_PRESETS,
} from './index.js';

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

const diagramFillKeySchema = z.enum(DIAGRAM_FILL_KEYS);
const diagramStrokeKeySchema = z.enum(DIAGRAM_STROKE_KEYS);
const diagramStrokeWidthPresetSchema = z.enum(DIAGRAM_STROKE_WIDTH_PRESETS);
const diagramFontSizePresetSchema = z.enum(DIAGRAM_FONT_SIZE_PRESETS);
const diagramStrokeStyleSchema = z.enum(DIAGRAM_STROKE_STYLES);

// Structural only: size bounds and the width/height pair rule are write-path
// invariants (see diagramWriteArtifactSchema) so a stored diagram always reads
// back, the same way legacy dangling edges do.
export const diagramNodeSchema = z.object({
  id: z.string().min(1),
  label: z.string().max(200),
  x: z.number(),
  y: z.number(),
  // Optional so diagrams authored before shapes existed still parse as boxes.
  shape: z.enum(['box', 'container', 'text']).optional(),
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

export const diagramArtifactSchema = z.object({
  type: z.literal('diagram'),
  nodes: z.array(diagramNodeSchema).max(100),
  edges: z.array(diagramEdgeSchema).max(200),
});

export const diagramWriteArtifactSchema = diagramArtifactSchema.superRefine(
  ({ nodes, edges }, context) => {
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

export const artifactJsonSchema = z.discriminatedUnion('type', [
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
  .superRefine((value, context) => {
    if (value.type !== value.artifactJson.type) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'type must match artifactJson.type',
        path: ['type'],
      });
    }

    if (value.artifactJson.type === 'diagram') {
      const parsed = diagramWriteArtifactSchema.safeParse(value.artifactJson);
      if (!parsed.success) {
        for (const issue of parsed.error.issues) {
          context.addIssue({ ...issue, path: ['artifactJson', ...issue.path] });
        }
      }
    }
  });

export type ProposalCreateInput = z.infer<typeof proposalCreateSchema>;
