// F36 — the three agent tools, and the registry the tool-calling loop iterates.
//
// Design note: `create_diagram` and `sticky_ideation` do not call the LLM again. The model
// already produced the content when it filled in the tool arguments; the tool's job is to
// validate that content, give it a deterministic layout/shape, and hand back a real
// artifact. That keeps one user turn to one LLM round trip per step and makes the tools
// unit-testable without a provider.
import {
  parseArtifact,
  STICKY_COLORS,
  summarizeArtifact,
  type AssistantToolName,
  type DiagramArtifact,
  type ProposalArtifact,
  type StickyArtifact,
  type StickyColor,
  type WebSearchResult,
} from '@roundtable/shared';
import { z } from 'zod';

import type { LlmToolDefinition } from '../llm.js';
import { layoutDiagram } from './layout.js';
import { searchWeb } from './webSearch.js';

export interface ToolRunContext {
  signal: AbortSignal;
  /** Streams an artifact to the client the moment it exists, before the model replies. */
  emitArtifact(artifact: ProposalArtifact, source: AssistantToolName): void;
}

export interface ToolRunResult {
  ok: boolean;
  /** One line for the UI's tool-result chip. */
  summary: string;
  /** Text handed back to the model as the tool message — this is what it reasons over. */
  modelText: string;
  results?: WebSearchResult[];
}

export interface AssistantTool {
  name: AssistantToolName;
  definition: LlmToolDefinition;
  run(rawArguments: unknown, context: ToolRunContext): Promise<ToolRunResult>;
}

// ---------------------------------------------------------------------------
// web_search
// ---------------------------------------------------------------------------

const webSearchArgsSchema = z.object({
  query: z.string().min(1).max(300),
});

const webSearchTool: AssistantTool = {
  name: 'web_search',
  definition: {
    type: 'function',
    function: {
      name: 'web_search',
      description:
        'Search the public web for current facts, comparisons, prices, docs or prior art. Use it when the answer depends on information you do not reliably know, and cite the sources you use.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search query, phrased as you would type it.' },
        },
        required: ['query'],
        additionalProperties: false,
      },
    },
  },
  async run(rawArguments, context) {
    const args = webSearchArgsSchema.safeParse(rawArguments);
    if (!args.success) {
      return invalidArgs('web_search', args.error);
    }

    const outcome = await searchWeb(args.data.query, context.signal);
    if (outcome.results.length === 0) {
      return {
        ok: false,
        summary: 'No results',
        modelText:
          outcome.note ??
          'No results found. Tell the user search came back empty and answer from what you know, flagging the uncertainty.',
      };
    }

    const modelText = outcome.results
      .map((r, i) => `[${i + 1}] ${r.title}\n${r.url}\n${r.snippet}`)
      .join('\n\n');

    return {
      ok: true,
      summary: `${outcome.results.length} result${outcome.results.length === 1 ? '' : 's'}`,
      modelText: outcome.note ? `${outcome.note}\n\n${modelText}` : modelText,
      results: outcome.results,
    };
  },
};

// ---------------------------------------------------------------------------
// create_diagram
// ---------------------------------------------------------------------------

const createDiagramArgsSchema = z.object({
  title: z.string().max(120).optional(),
  nodes: z
    .array(
      z.object({
        id: z
          .string()
          .min(1)
          .max(64)
          .regex(
            /^[A-Za-z0-9_-]+$/,
            'Node ids may use letters, digits, hyphen and underscore only',
          ),
        label: z.string().min(1).max(120),
      }),
    )
    .min(2, 'A diagram needs at least two nodes')
    .max(24),
  edges: z
    .array(
      z.object({
        from: z.string().min(1).max(64),
        to: z.string().min(1).max(64),
        label: z.string().max(80).optional(),
      }),
    )
    .max(60)
    .default([]),
});

const createDiagramTool: AssistantTool = {
  name: 'create_diagram',
  definition: {
    type: 'function',
    function: {
      name: 'create_diagram',
      description:
        'Draw a node-and-arrow diagram (architecture, flow, sequence of steps, decision tree) that the user can propose onto the pinboard. Give structure only — positions are computed for you. Use this ONLY when a picture answers the question better than a sentence would.',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Short title for the diagram.' },
          nodes: {
            type: 'array',
            description: 'Boxes in the diagram, 2–24 of them.',
            items: {
              type: 'object',
              properties: {
                id: { type: 'string', description: 'Short unique id, e.g. "api" or "step1".' },
                label: { type: 'string', description: 'Text shown inside the box.' },
              },
              required: ['id', 'label'],
              additionalProperties: false,
            },
          },
          edges: {
            type: 'array',
            description: 'Arrows between nodes, referencing node ids.',
            items: {
              type: 'object',
              properties: {
                from: { type: 'string' },
                to: { type: 'string' },
                label: { type: 'string', description: 'Optional text on the arrow.' },
              },
              required: ['from', 'to'],
              additionalProperties: false,
            },
          },
        },
        required: ['nodes'],
        additionalProperties: false,
      },
    },
  },
  async run(rawArguments, context) {
    const args = createDiagramArgsSchema.safeParse(rawArguments);
    if (!args.success) {
      return invalidArgs('create_diagram', args.error);
    }

    const ids = new Set(args.data.nodes.map((n) => n.id));
    const danglingEdge = args.data.edges.find((e) => !ids.has(e.from) || !ids.has(e.to));
    if (danglingEdge) {
      return {
        ok: false,
        summary: 'Invalid diagram',
        modelText: `Edge ${danglingEdge.from} → ${danglingEdge.to} references a node id that is not in the nodes array. Call create_diagram again with matching ids.`,
      };
    }

    const candidate: DiagramArtifact = {
      type: 'diagram',
      ...(args.data.title ? { title: args.data.title } : {}),
      nodes: layoutDiagram(args.data.nodes, args.data.edges),
      edges: args.data.edges,
    };

    const parsed = parseArtifact(candidate);
    if (!parsed.ok) {
      return {
        ok: false,
        summary: 'Invalid diagram',
        modelText: `Diagram rejected: ${parsed.error}`,
      };
    }

    context.emitArtifact(parsed.artifact, 'create_diagram');
    return {
      ok: true,
      summary: `Diagram: ${candidate.nodes.length} nodes`,
      modelText: `Diagram created and shown to the user (${summarizeArtifact(parsed.artifact)}). They can propose it to the pinboard with one click — do not repeat the diagram as text.`,
    };
  },
};

// ---------------------------------------------------------------------------
// sticky_ideation
// ---------------------------------------------------------------------------

const stickyIdeationArgsSchema = z.object({
  ideas: z
    .array(
      z.object({
        text: z.string().min(1).max(280),
        color: z.enum(STICKY_COLORS).optional(),
      }),
    )
    .min(1)
    .max(8),
});

const stickyIdeationTool: AssistantTool = {
  name: 'sticky_ideation',
  definition: {
    type: 'function',
    function: {
      name: 'sticky_ideation',
      description:
        'Turn ideas into 3–5 candidate sticky notes the user can propose onto the pinboard. Each note should stand alone as one idea, phrased tightly enough to read at a glance. Use this ONLY when the user is asking for notes, options or a brainstorm to put on the board — an ordinary question wants a prose answer, even if an earlier message in the conversation asked for sticky notes.',
      parameters: {
        type: 'object',
        properties: {
          ideas: {
            type: 'array',
            description: 'Three to five distinct ideas.',
            items: {
              type: 'object',
              properties: {
                text: {
                  type: 'string',
                  description: 'The note text — one idea, ideally under 20 words.',
                },
                color: { type: 'string', enum: [...STICKY_COLORS] },
              },
              required: ['text'],
              additionalProperties: false,
            },
          },
        },
        required: ['ideas'],
        additionalProperties: false,
      },
    },
  },
  async run(rawArguments, context) {
    const args = stickyIdeationArgsSchema.safeParse(rawArguments);
    if (!args.success) {
      return invalidArgs('sticky_ideation', args.error);
    }

    // Cap at five: more than that stops being a shortlist and starts being a wall.
    const ideas = args.data.ideas.slice(0, 5);
    const accepted: StickyArtifact[] = [];
    const rejected: string[] = [];

    ideas.forEach((idea, index) => {
      const candidate: StickyArtifact = {
        type: 'sticky',
        text: idea.text.trim(),
        color: idea.color ?? rotateColor(index),
      };
      const parsed = parseArtifact(candidate);
      if (parsed.ok) {
        accepted.push(parsed.artifact as StickyArtifact);
        context.emitArtifact(parsed.artifact, 'sticky_ideation');
      } else {
        rejected.push(parsed.error);
      }
    });

    if (accepted.length === 0) {
      return {
        ok: false,
        summary: 'No usable notes',
        modelText: `Every sticky note was rejected: ${rejected.join('; ')}`,
      };
    }

    return {
      ok: true,
      summary: `${accepted.length} sticky note${accepted.length === 1 ? '' : 's'}`,
      modelText: `${accepted.length} sticky notes created and shown to the user: ${accepted
        .map((s) => `"${s.text}"`)
        .join(
          ', ',
        )}. They can propose any of them with one click — introduce them in a sentence rather than listing them again.`,
    };
  },
};

/** Cycles the palette so a batch of notes is visually distinguishable by default. */
function rotateColor(index: number): StickyColor {
  return STICKY_COLORS[index % STICKY_COLORS.length] as StickyColor;
}

function invalidArgs(tool: AssistantToolName, error: z.ZodError): ToolRunResult {
  const detail = error.issues
    .map((issue) => `${issue.path.join('.') || 'arguments'}: ${issue.message}`)
    .join('; ');
  return {
    ok: false,
    summary: 'Invalid arguments',
    modelText: `${tool} was called with invalid arguments (${detail}). Fix them and call the tool again.`,
  };
}

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

export const assistantTools: Record<AssistantToolName, AssistantTool> = {
  web_search: webSearchTool,
  create_diagram: createDiagramTool,
  sticky_ideation: stickyIdeationTool,
};

export const assistantToolDefinitions: LlmToolDefinition[] = Object.values(assistantTools).map(
  (tool) => tool.definition,
);

export function findTool(name: string): AssistantTool | undefined {
  return (assistantTools as Record<string, AssistantTool>)[name];
}
