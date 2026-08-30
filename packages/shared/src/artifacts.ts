// Proposal artifact contracts — the shape of everything that can land on the pinboard.
//
// Owned jointly by the Creative Tools + Pinboard owners (docs/06 Coordination Point 3);
// authored here by the Assistant owner because F36/F37 needed it first. If you own
// tools or pinboard: import from here rather than redefining these shapes.
//
// Every artifact is validated on the way in (agent tool output, editor output, socket
// payload) so a malformed artifact never reaches the database.
import { z } from 'zod';

export const STICKY_COLORS = ['yellow', 'pink', 'blue', 'green'] as const;
export const stickyColorSchema = z.enum(STICKY_COLORS);
export type StickyColor = z.infer<typeof stickyColorSchema>;

export const stickyArtifactSchema = z.object({
  type: z.literal('sticky'),
  text: z.string().min(1).max(500),
  color: stickyColorSchema,
});

export const drawingArtifactSchema = z.object({
  type: z.literal('drawing'),
  /** Serialized SVG. No file uploads in the MVP (docs/02 §8.5). */
  svg: z.string().min(1),
});

export const diagramNodeSchema = z.object({
  id: z.string().min(1).max(64),
  label: z.string().min(1).max(120),
  x: z.number().finite(),
  y: z.number().finite(),
});

export const diagramEdgeSchema = z.object({
  from: z.string().min(1).max(64),
  to: z.string().min(1).max(64),
  label: z.string().max(80).optional(),
});

export const diagramArtifactSchema = z
  .object({
    type: z.literal('diagram'),
    title: z.string().max(120).optional(),
    nodes: z.array(diagramNodeSchema).min(1).max(40),
    edges: z.array(diagramEdgeSchema).max(80),
  })
  .superRefine((diagram, ctx) => {
    const ids = new Set(diagram.nodes.map((n) => n.id));
    if (ids.size !== diagram.nodes.length) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Duplicate node id', path: ['nodes'] });
    }
    diagram.edges.forEach((edge, i) => {
      if (!ids.has(edge.from)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Edge references unknown node "${edge.from}"`,
          path: ['edges', i, 'from'],
        });
      }
      if (!ids.has(edge.to)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Edge references unknown node "${edge.to}"`,
          path: ['edges', i, 'to'],
        });
      }
    });
  });

export const proposalArtifactSchema = z.discriminatedUnion('type', [
  stickyArtifactSchema,
  drawingArtifactSchema,
  // `diagramArtifactSchema` carries a `superRefine`, so it is a ZodEffects and cannot join a
  // discriminated union. The union below re-declares the diagram object and re-applies the
  // structural checks in `parseArtifact`.
  diagramArtifactSchema.innerType(),
]);

export type StickyArtifact = z.infer<typeof stickyArtifactSchema>;
export type DrawingArtifact = z.infer<typeof drawingArtifactSchema>;
export type DiagramArtifact = z.infer<typeof diagramArtifactSchema>;
export type DiagramNode = z.infer<typeof diagramNodeSchema>;
export type DiagramEdge = z.infer<typeof diagramEdgeSchema>;
export type ProposalArtifact = StickyArtifact | DrawingArtifact | DiagramArtifact;
export type ProposalType = ProposalArtifact['type'];

/** Hard ceiling on a serialized artifact (docs/02 §8.5) — keeps jsonb rows and socket frames sane. */
export const MAX_ARTIFACT_BYTES = 100_000;

export function artifactByteSize(artifact: unknown): number {
  return new TextEncoder().encode(JSON.stringify(artifact)).length;
}

export type ArtifactParseResult =
  { ok: true; artifact: ProposalArtifact } | { ok: false; error: string };

/**
 * Single entry point for validating an artifact from any source (agent tool, editor,
 * socket payload). Applies the discriminated-union shape check, the diagram-specific
 * referential checks, and the size ceiling.
 */
export function parseArtifact(input: unknown): ArtifactParseResult {
  const base = proposalArtifactSchema.safeParse(input);
  if (!base.success) {
    return { ok: false, error: base.error.issues.map(formatIssue).join('; ') };
  }
  if (base.data.type === 'diagram') {
    const diagram = diagramArtifactSchema.safeParse(base.data);
    if (!diagram.success) {
      return { ok: false, error: diagram.error.issues.map(formatIssue).join('; ') };
    }
  }
  const size = artifactByteSize(base.data);
  if (size > MAX_ARTIFACT_BYTES) {
    return { ok: false, error: `Artifact is ${size} bytes; limit is ${MAX_ARTIFACT_BYTES}` };
  }
  return { ok: true, artifact: base.data };
}

function formatIssue(issue: z.ZodIssue): string {
  const path = issue.path.join('.');
  return path ? `${path}: ${issue.message}` : issue.message;
}

/** One-line human summary of an artifact — used in chat UI and in assistant context blocks. */
export function summarizeArtifact(artifact: ProposalArtifact): string {
  switch (artifact.type) {
    case 'sticky':
      return artifact.text.length > 80 ? `${artifact.text.slice(0, 77)}…` : artifact.text;
    case 'drawing':
      return 'Freehand drawing';
    case 'diagram': {
      const label = artifact.title ? `${artifact.title}: ` : '';
      return `${label}${artifact.nodes.length} nodes, ${artifact.edges.length} edges`;
    }
  }
}
