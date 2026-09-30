// Starter templates for a studio canvas.
//
// RoundTable is a facilitated brainstorming tool, so the useful thing to offer
// someone staring at an empty sheet is the shape of the conversation, not more
// tools. Each template is only a preset that emits ordinary shapes, text,
// arrows and tables — there is nothing new in the artifact, and everything it
// produces can be moved, restyled, regrouped or deleted like anything else on
// the canvas.
//
// Every one is laid out on the 8-unit grid inside the 960 x 600 sheet, and
// states its own sizes, colours and text sizes, so it looks the same whatever
// the studio's defaults become. `studioTemplates.test.ts` holds each one to
// the real write contract.

import {
  diagramTextBoxHeight,
  type ArrowElement,
  type ArrowEndpoint,
  type DiagramFillKey,
  type DiagramNode,
  type DiagramStrokeKey,
  type TableCell,
  type TableElement,
} from '@roundtable/shared';

/** What a template puts on the canvas. Nothing of the older `edges`: every link is an arrow. */
export interface StudioTemplateScene {
  nodes: DiagramNode[];
  arrows: ArrowElement[];
  tables: TableElement[];
}

export interface StudioTemplate {
  id: string;
  label: string;
  /** Shown as the button's title; says what the template is for. */
  hint: string;
  build: () => StudioTemplateScene;
}

// --- Building blocks ---------------------------------------------------------

type NodeStyle = Omit<DiagramNode, 'id' | 'label' | 'x' | 'y' | 'width' | 'height'>;

function shape(
  id: string,
  label: string,
  x: number,
  y: number,
  width: number,
  height: number,
  style: NodeStyle,
): DiagramNode {
  return { id, label, x, y, width, height, fontSizePreset: 'medium', ...style };
}

/** Free text, as tall as its words need at its width, the way the editor sizes it. */
function text(
  id: string,
  label: string,
  x: number,
  y: number,
  width: number,
  style: Omit<NodeStyle, 'shape'> = {},
): DiagramNode {
  const node: DiagramNode = {
    id,
    label,
    x,
    y,
    shape: 'text',
    width,
    height: 32,
    fontSizePreset: 'medium',
    labelAlign: 'left',
    ...style,
  };
  return { ...node, height: diagramTextBoxHeight(node) };
}

const title = (id: string, label: string, x: number, y: number, width = 384) =>
  text(id, label, x, y, width, { fontSizePreset: 'large', labelBold: true, labelColor: 'ink' });

/**
 * A tinted panel that holds things: a container, so what is dropped into it
 * travels with it, drawn with no outline so it reads as a panel rather than as
 * a dashed frame. Its heading is a text of its own at the top, since a
 * container's own label sits in its middle.
 */
function panel(
  id: string,
  x: number,
  y: number,
  width: number,
  height: number,
  fill: DiagramFillKey,
): DiagramNode {
  return shape(id, '', x, y, width, height, {
    shape: 'container',
    fillColor: fill,
    strokeColor: 'transparent',
  });
}

function heading(
  id: string,
  label: string,
  parent: DiagramNode,
  colour: DiagramStrokeKey,
  hint?: string,
): DiagramNode[] {
  const x = parent.x + 16;
  const width = (parent.width ?? 0) - 32;
  // Kept on the grid, as everything a template puts down is: dropped with
  // snapping on, anything off it would be pulled a few units out of place.
  const top = text(id, label, x, parent.y + 8, width, {
    labelBold: true,
    labelColor: colour,
    parentId: parent.id,
  });
  if (!hint) return [top];
  return [
    top,
    text(`${id}-hint`, hint, x, top.y + 24, width, {
      fontSizePreset: 'small',
      labelColor: 'grey',
      parentId: parent.id,
    }),
  ];
}

/** A note on a panel: a white card with a quiet outline. */
function card(id: string, label: string, parent: DiagramNode, x: number, y: number, width: number) {
  return shape(id, label, x, y, width, 56, {
    shape: 'box',
    fillColor: 'surface',
    strokeColor: 'grey',
    strokeWidthPreset: 'thin',
    labelAlign: 'left',
    parentId: parent.id,
  });
}

type Side = 'n' | 'e' | 's' | 'w';
const SIDE_AT: Record<Side, { u: number; v: number }> = {
  n: { u: 0.5, v: 0 },
  e: { u: 1, v: 0.5 },
  s: { u: 0.5, v: 1 },
  w: { u: 0, v: 0.5 },
};

/**
 * An arrow's end on a shape: pinned to the middle of one side, or — with no
 * side — aimed at its centre and free to meet whichever face the other end is
 * on. The point is stored too, as every bound end's is.
 */
function on(node: DiagramNode, side?: Side): ArrowEndpoint {
  const width = node.width ?? 0;
  const height = node.height ?? 0;
  if (!side) return { x: node.x + width / 2, y: node.y + height / 2, elementId: node.id };
  const at = SIDE_AT[side];
  return { x: node.x + at.u * width, y: node.y + at.v * height, elementId: node.id, at: { ...at } };
}

function link(
  id: string,
  from: ArrowEndpoint,
  to: ArrowEndpoint,
  style: Omit<ArrowElement, 'id' | 'from' | 'to'> = {},
): ArrowElement {
  return {
    id,
    from,
    to,
    strokeColor: 'slate',
    ...(style.label ? { fontSizePreset: 'medium' as const } : {}),
    ...style,
  };
}

/** A small table of headings and empty rows, its first row tinted as a heading. */
function grid(
  id: string,
  x: number,
  y: number,
  colWidths: number[],
  headings: string[],
  rows: number,
): TableElement {
  const cells: TableCell[] = [];
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < colWidths.length; col += 1) {
      cells.push(row === 0 ? { text: headings[col] ?? '', fill: 'neutral', bold: true } : {});
    }
  }
  return {
    id,
    x,
    y,
    colWidths,
    rowHeights: Array.from({ length: rows }, () => 32),
    cells,
    fontSizePreset: 'small',
  };
}

// --- The templates -------------------------------------------------------------

function matrix(): StudioTemplateScene {
  // High impact at the top, low effort on the left.
  const quadrant = (
    id: string,
    x: number,
    y: number,
    fill: DiagramFillKey,
    colour: DiagramStrokeKey,
    label: string,
    hint: string,
  ) => {
    const box = panel(id, x, y, 256, 168, fill);
    return [box, ...heading(`${id}-title`, label, box, colour, hint)];
  };
  return {
    nodes: [
      title('matrix-title', 'Impact vs effort', 208, 80),
      ...quadrant(
        'quick-wins',
        208,
        136,
        'green',
        'green',
        'Quick wins',
        'High impact, low effort',
      ),
      ...quadrant('big-bets', 480, 136, 'blue', 'blue', 'Big bets', 'High impact, high effort'),
      ...quadrant('fill-ins', 208, 320, 'amber', 'amber', 'Fill-ins', 'Low impact, low effort'),
      ...quadrant('time-sinks', 480, 320, 'rose', 'rose', 'Time sinks', 'Low impact, high effort'),
    ],
    arrows: [
      link(
        'matrix-impact',
        { x: 184, y: 488 },
        { x: 184, y: 136 },
        {
          label: 'Impact',
          labelSide: 'above',
        },
      ),
      link(
        'matrix-effort',
        { x: 208, y: 512 },
        { x: 736, y: 512 },
        {
          label: 'Effort',
          labelSide: 'below',
        },
      ),
    ],
    tables: [],
  };
}

function lanes(): StudioTemplateScene {
  const lane = (
    id: string,
    label: string,
    y: number,
    fill: DiagramFillKey,
    colour: DiagramStrokeKey,
  ) => ({
    head: shape(`${id}-head`, label, 144, y, 128, 120, {
      shape: 'rectangle',
      fillColor: fill,
      strokeColor: 'transparent',
      labelBold: true,
      labelColor: colour,
    }),
    body: panel(id, 280, y, 536, 120, fill),
  });
  const discover = lane('discover', 'Discover', 120, 'blue', 'blue');
  const build = lane('build', 'Build', 256, 'violet', 'violet');
  const ship = lane('ship', 'Ship', 392, 'green', 'green');
  const step = (id: string, label: string, parent: DiagramNode, x: number) =>
    shape(id, label, x, parent.y + 32, 144, 56, {
      shape: 'box',
      fillColor: 'surface',
      strokeColor: 'slate',
      strokeWidthPreset: 'thin',
      parentId: parent.id,
    });
  const research = step('lanes-research', 'Research', discover.body, 304);
  const prototype = step('lanes-prototype', 'Prototype', build.body, 464);
  const test = step('lanes-test', 'Test', build.body, 648);
  const launch = step('lanes-launch', 'Launch', ship.body, 648);
  return {
    nodes: [
      title('lanes-title', 'Who does what, when', 144, 72),
      discover.head,
      discover.body,
      build.head,
      build.body,
      ship.head,
      ship.body,
      research,
      prototype,
      test,
      launch,
    ],
    arrows: [
      link('lanes-a1', on(research, 'e'), on(prototype, 'n'), { route: 'elbow' }),
      link('lanes-a2', on(prototype, 'e'), on(test, 'w')),
      link('lanes-a3', on(test, 's'), on(launch, 'n')),
    ],
    tables: [],
  };
}

function retro(): StudioTemplateScene {
  const column = (
    id: string,
    label: string,
    x: number,
    width: number,
    fill: DiagramFillKey,
    colour: DiagramStrokeKey,
    hint: string,
  ) => {
    const box = panel(id, x, 136, width, 320, fill);
    return { box, head: heading(`${id}-title`, label, box, colour, hint) };
  };
  const well = column('went-well', 'Went well', 128, 216, 'green', 'green', 'Keep doing these');
  const improve = column('to-improve', 'To improve', 360, 216, 'amber', 'amber', 'Change these');
  const actions = column('actions', 'Actions', 592, 280, 'blue', 'blue', 'Who does what, by when');
  return {
    nodes: [
      title('retro-title', 'Retrospective', 128, 80),
      well.box,
      ...well.head,
      card('went-well-card', 'Shipped on time', well.box, 144, 216, 184),
      improve.box,
      ...improve.head,
      card('to-improve-card', 'Too many meetings', improve.box, 376, 216, 184),
      actions.box,
      ...actions.head,
    ],
    arrows: [],
    tables: [grid('retro-actions', 608, 216, [104, 80, 64], ['Action', 'Owner', 'Due'], 4)],
  };
}

function timeline(): StudioTemplateScene {
  const phases: [string, string, string, string, DiagramFillKey, DiagramStrokeKey][] = [
    ['now', 'Now', 'This month', 'What is under way', 'green', 'green'],
    ['next', 'Next', 'Next quarter', 'What comes after', 'blue', 'blue'],
    ['later', 'Later', 'This year', 'What we are aiming for', 'violet', 'violet'],
    ['someday', 'Someday', 'Not yet planned', 'Ideas to keep in mind', 'neutral', 'slate'],
  ];
  const nodes: DiagramNode[] = [title('timeline-title', 'Roadmap', 152, 168)];
  const milestones: DiagramNode[] = [];
  phases.forEach(([id, label, when, note, fill, colour], index) => {
    const x = 152 + index * 192;
    const milestone = shape(`timeline-${id}`, label, x, 280, 144, 64, {
      shape: 'box',
      fillColor: fill,
      strokeColor: colour,
      labelBold: true,
      labelColor: colour,
    });
    milestones.push(milestone);
    nodes.push(
      text(`timeline-${id}-when`, when, x, 240, 144, {
        fontSizePreset: 'small',
        labelColor: 'grey',
        labelAlign: 'center',
      }),
      milestone,
      text(`timeline-${id}-note`, note, x, 360, 144, {
        fontSizePreset: 'small',
        labelAlign: 'center',
      }),
    );
  });
  return {
    nodes,
    arrows: milestones
      .slice(1)
      .map((milestone, index) =>
        link(`timeline-a${index + 1}`, on(milestones[index]!, 'e'), on(milestone, 'w')),
      ),
    tables: [],
  };
}

function flowchart(): StudioTemplateScene {
  // All four centred on one line, y = 248.
  const start = shape('flow-start', 'Start', 96, 216, 136, 64, {
    shape: 'ellipse',
    fillColor: 'green',
    strokeColor: 'green',
  });
  const work = shape('flow-step', 'Do the work', 296, 216, 152, 64, {
    shape: 'box',
    fillColor: 'surface',
    strokeColor: 'slate',
  });
  const check = shape('flow-check', 'Done?', 512, 192, 160, 112, {
    shape: 'diamond',
    fillColor: 'amber',
    strokeColor: 'amber',
  });
  const end = shape('flow-end', 'Finish', 744, 216, 136, 64, {
    shape: 'ellipse',
    fillColor: 'rose',
    strokeColor: 'rose',
  });
  return {
    nodes: [title('flow-title', 'Process', 96, 136), start, work, check, end],
    arrows: [
      link('flow-a1', on(start, 'e'), on(work, 'w')),
      link('flow-a2', on(work, 'e'), on(check, 'w')),
      link('flow-yes', on(check, 'e'), on(end, 'w'), { label: 'Yes', labelSide: 'above' }),
      // Not done yet: round the bottom and back to the work.
      link('flow-no', on(check, 's'), on(work, 's'), {
        route: 'elbow',
        label: 'No',
        labelSide: 'below',
      }),
    ],
    tables: [],
  };
}

function kanban(): StudioTemplateScene {
  const column = (id: string, label: string, x: number, colour: DiagramStrokeKey) => {
    const box = panel(id, x, 136, 232, 360, 'neutral');
    return { box, head: heading(`${id}-title`, label, box, colour) };
  };
  const todo = column('todo', 'To do', 128, 'slate');
  const doing = column('doing', 'Doing', 368, 'amber');
  const done = column('done', 'Done', 608, 'green');
  const cards = (column: { box: DiagramNode }, labels: string[]) =>
    labels.map((label, index) =>
      card(
        `${column.box.id}-card-${index + 1}`,
        label,
        column.box,
        column.box.x + 16,
        192 + index * 72,
        200,
      ),
    );
  return {
    nodes: [
      title('kanban-title', 'Board', 128, 80),
      todo.box,
      ...todo.head,
      ...cards(todo, ['Write the brief', 'Book a room', 'Invite the team']),
      doing.box,
      ...doing.head,
      ...cards(doing, ['Draft the survey', 'Collect ideas']),
      done.box,
      ...done.head,
      ...cards(done, ['Kick-off meeting']),
    ],
    arrows: [],
    tables: [],
  };
}

function swot(): StudioTemplateScene {
  const quarter = (
    id: string,
    x: number,
    y: number,
    fill: DiagramFillKey,
    colour: DiagramStrokeKey,
    label: string,
    hint: string,
  ) => {
    const box = panel(id, x, y, 312, 192, fill);
    return [box, ...heading(`${id}-title`, label, box, colour, hint)];
  };
  return {
    nodes: [
      title('swot-title', 'SWOT analysis', 152, 56),
      ...quarter('strengths', 152, 112, 'green', 'green', 'Strengths', 'What do we do well?'),
      ...quarter('weaknesses', 480, 112, 'rose', 'rose', 'Weaknesses', 'Where do we fall short?'),
      ...quarter(
        'opportunities',
        152,
        320,
        'blue',
        'blue',
        'Opportunities',
        'What could we make the most of?',
      ),
      ...quarter('threats', 480, 320, 'amber', 'amber', 'Threats', 'What could get in the way?'),
    ],
    arrows: [],
    tables: [],
  };
}

function mindMap(): StudioTemplateScene {
  const centre = shape('mind-centre', 'Main idea', 392, 256, 176, 88, {
    shape: 'ellipse',
    fillColor: 'violet',
    strokeColor: 'violet',
    fontSizePreset: 'large',
    labelBold: true,
    labelColor: 'violet',
  });
  const branch = (
    id: string,
    label: string,
    x: number,
    y: number,
    fill: DiagramFillKey,
    colour: DiagramStrokeKey,
  ) =>
    shape(id, label, x, y, 152, 56, {
      shape: 'box',
      fillColor: fill,
      strokeColor: colour,
      labelBold: true,
      labelColor: colour,
    });
  const leaf = (id: string, label: string, x: number, y: number) =>
    shape(id, label, x, y, 152, 40, {
      shape: 'box',
      fillColor: 'surface',
      strokeColor: 'grey',
      strokeWidthPreset: 'thin',
      fontSizePreset: 'small',
    });
  const branches = [
    branch('mind-why', 'Why', 160, 160, 'blue', 'blue'),
    branch('mind-who', 'Who', 648, 160, 'green', 'green'),
    branch('mind-how', 'How', 160, 392, 'amber', 'amber'),
    branch('mind-risks', 'Risks', 648, 392, 'rose', 'rose'),
  ];
  const leaves = [
    leaf('mind-why-leaf', 'The problem it solves', 160, 88),
    leaf('mind-who-leaf', 'Who it is for', 648, 88),
    leaf('mind-how-leaf', 'First step', 160, 480),
    leaf('mind-risks-leaf', 'What could go wrong', 648, 480),
  ];
  // Plain lines: a mind map's branches grow out of the idea, they do not point.
  const plain = { endCap: 'none' as const, strokeColor: 'grey' as const };
  return {
    nodes: [centre, ...branches, ...leaves],
    arrows: [
      ...branches.map((node) => link(`${node.id}-line`, on(centre), on(node), plain)),
      ...branches.map((node, index) => {
        const up = index < 2;
        return link(
          `${node.id}-leaf-line`,
          on(node, up ? 'n' : 's'),
          on(leaves[index]!, up ? 's' : 'n'),
          plain,
        );
      }),
    ],
    tables: [],
  };
}

export const STUDIO_TEMPLATES: StudioTemplate[] = [
  {
    id: 'matrix',
    label: 'Matrix',
    hint: 'Impact and effort quadrants for sorting ideas',
    build: matrix,
  },
  {
    id: 'lanes',
    label: 'Lanes',
    hint: 'Swimlanes for splitting work across teams or stages',
    build: lanes,
  },
  {
    id: 'retro',
    label: 'Retro',
    hint: 'Went well, to improve, and a table of actions',
    build: retro,
  },
  {
    id: 'timeline',
    label: 'Timeline',
    hint: 'Now, next, later — connected in order',
    build: timeline,
  },
  {
    id: 'flowchart',
    label: 'Flowchart',
    hint: 'Steps and a decision, with a loop back',
    build: flowchart,
  },
  {
    id: 'kanban',
    label: 'Kanban',
    hint: 'To do, doing, done, with cards to move along',
    build: kanban,
  },
  {
    id: 'swot',
    label: 'SWOT',
    hint: 'Strengths, weaknesses, opportunities and threats',
    build: swot,
  },
  {
    id: 'mindmap',
    label: 'Mind map',
    hint: 'One idea in the middle, branching out',
    build: mindMap,
  },
];

/** A template as a fragment the studio's paster takes, with nothing else in it. */
export function templateFragment(template: StudioTemplate) {
  const scene = template.build();
  return { ...scene, edges: [], ink: [], paths: [] };
}
