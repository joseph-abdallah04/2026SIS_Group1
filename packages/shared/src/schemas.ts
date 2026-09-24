import { z } from 'zod';

import {
  DRAWING_ARTIFACT_LIMIT,
  DRAWING_INK_KEYS,
  DRAWING_PEN_WIDTHS,
  DRAWING_VIEWBOX_HEIGHT,
  DRAWING_VIEWBOX_WIDTH,
} from './drawingContract.js';
import { IMAGE_ARTIFACT_LIMIT, IMAGE_MAX_EDGE, isStorableImage } from './imageContract.js';
import { isEmoji, MAX_REACTION_LENGTH } from './reactionContract.js';
import {
  STICKY_HREF_MAX_LENGTH,
  STICKY_LINE_LIMIT,
  STICKY_LINE_STYLES,
  STICKY_LINK_LIMIT,
  STICKY_LIST_MAX_LEVEL,
  STICKY_MARK_LIMIT,
  STICKY_MARK_STYLES,
  stickyLinkHref,
} from './stickyContract.js';
import {
  DIAGRAM_FILL_KEYS,
  DIAGRAM_NODE_SHAPE_KEYS,
  DIAGRAM_FONT_SIZE_PRESETS,
  DIAGRAM_TEXT_ALIGNS,
  DIAGRAM_MAX_NODE_HEIGHT,
  DIAGRAM_MAX_NODE_WIDTH,
  DIAGRAM_MIN_NODE_HEIGHT,
  DIAGRAM_MIN_NODE_WIDTH,
  DIAGRAM_STROKE_KEYS,
  DIAGRAM_STROKE_STYLES,
  DIAGRAM_STROKE_WIDTH_PRESETS,
  diagramCanParent,
  diagramIsAncestor,
} from './diagramContract.js';
import {
  ARROW_CAPS,
  ARROW_LABEL_LIMIT,
  ARROW_LABEL_SIDES,
  ARROW_MAX_BEND,
  ARROW_ROUTES,
  DIAGRAM_ARROW_LIMIT,
} from './studioArrows.js';
import {
  DIAGRAM_INK_LIMIT,
  DIAGRAM_INK_POINT_LIMIT,
  DIAGRAM_PATH_ANCHOR_LIMIT,
  DIAGRAM_PATH_LIMIT,
  DIAGRAM_TABLE_LIMIT,
  TABLE_CELL_ALIGNS,
  TABLE_CELL_TEXT_LIMIT,
  TABLE_MAX_COLS,
  TABLE_MAX_COL_WIDTH,
  TABLE_MAX_ROWS,
  TABLE_MAX_ROW_HEIGHT,
  TABLE_MIN_COL_WIDTH,
  TABLE_MIN_ROW_HEIGHT,
  DIAGRAM_Z_LIMIT,
  diagramEdgeKey,
} from './studioElements.js';

// Pattern for API DTO validation: define the zod schema, export `z.infer` as the type.
// Use on REST bodies (server) and forms (web). Add your module's schemas under its label.

// Every field carries its own message — the default zod ones ("String must
// contain at least 8 character(s)") are implementation-speak, not something
// to show someone filling in a form.
// New-account passwords only — an existing account may predate this rule, so
// `loginSchema` and `deleteAccountSchema` below deliberately stay permissive;
// tightening this would lock people out of a password they already have.
//
// One combined check with one message, rather than a chain of `.regex()`
// calls: zod only ever surfaces the *first* failing rule, so a chain would
// reveal requirements one at a time across repeated submits instead of
// telling the user everything expected up front.
const PASSWORD_REQUIREMENTS_MESSAGE =
  'Password must be at least 8 characters and include an uppercase letter, a lowercase letter, a number, and a special character';

function meetsPasswordRequirements(value: string): boolean {
  return (
    value.length >= 8 &&
    /[A-Z]/.test(value) &&
    /[a-z]/.test(value) &&
    /[0-9]/.test(value) &&
    /[^A-Za-z0-9]/.test(value)
  );
}

const signupPasswordSchema = z
  .string()
  .refine(meetsPasswordRequirements, { message: PASSWORD_REQUIREMENTS_MESSAGE });

export const signupSchema = z.object({
  email: z.string().email('Please enter a valid email address'),
  password: signupPasswordSchema,
  displayName: z
    .string()
    .trim()
    .min(1, 'Please enter a display name')
    .max(50, 'Display name must be 50 characters or fewer'),
});

export const loginSchema = z.object({
  email: z.string().email('Please enter a valid email address'),
  password: z.string().min(1, 'Please enter your password'),
});

export const updateProfileSchema = z.object({
  displayName: z.string().trim().min(1).max(50),
});

// Account deletion: the typed-confirmation step is the password field itself — the
// button stays disabled client-side until it's non-empty, and the server
// re-checks it against the account's real passwordHash before deleting
// anything, so a stale/unlocked tab isn't enough on its own.
export const deleteAccountSchema = z.object({
  password: z.string().min(1),
});

export type SignupInput = z.infer<typeof signupSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
export type DeleteAccountInput = z.infer<typeof deleteAccountSchema>;

// === sessions module ===

/** Seconds field on a session clock — 0, 15, 30, or 45. */
export const TIMER_SECOND_STEP = 15;
/** Longest discussion timer a leader may set. */
export const DISCUSSION_TIMER_MAX_SECONDS = 3 * 60 * 60;
/** Longest voting timer a leader may set. */
export const VOTING_TIMER_MAX_SECONDS = 60 * 60;

export interface TimerDurationParts {
  hours: number;
  minutes: number;
  seconds: number;
}

export function splitTimerSeconds(total: number | null | undefined): TimerDurationParts {
  if (total == null || total <= 0) return { hours: 0, minutes: 0, seconds: 0 };
  let seconds = Math.round((total % 60) / TIMER_SECOND_STEP) * TIMER_SECOND_STEP;
  let minutes = Math.floor((total % 3600) / 60);
  let hours = Math.floor(total / 3600);
  if (seconds === 60) {
    seconds = 0;
    minutes += 1;
  }
  if (minutes === 60) {
    minutes = 0;
    hours += 1;
  }
  return { hours, minutes, seconds };
}

export function combineTimerSeconds(parts: TimerDurationParts): number | null {
  const total = parts.hours * 3600 + parts.minutes * 60 + parts.seconds;
  return total > 0 ? total : null;
}

const optionalTimerSeconds = (max: number) =>
  z
    .number()
    .int()
    .min(TIMER_SECOND_STEP)
    .max(max)
    .multipleOf(TIMER_SECOND_STEP)
    .nullable()
    .optional();

/** Longest a single question may be. */
export const SESSION_QUESTION_TEXT_MAX = 500;
/** Hard cap on an agenda, including questions added mid-session. */
export const SESSION_QUESTION_LIMIT = 50;

export const questionTextSchema = z.string().trim().min(1).max(SESSION_QUESTION_TEXT_MAX);

// F04: title + an ordered list of questions. Order is exactly the array
// order — the server assigns `position` from array index, so reordering
// client-side and resubmitting is how a question list gets reordered.
// Timer seconds are optional: omit or `null` means that clock is off.
export const createSessionSchema = z.object({
  title: z.string().trim().min(1).max(120),
  questions: z.array(questionTextSchema).min(1).max(SESSION_QUESTION_LIMIT),
  discussionTimerSeconds: optionalTimerSeconds(DISCUSSION_TIMER_MAX_SECONDS),
  votingTimerSeconds: optionalTimerSeconds(VOTING_TIMER_MAX_SECONDS),
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

// Leader appending one pending question to a live agenda. Position and
// status are assigned server-side — the body is only the text.
export const addSessionQuestionSchema = z.object({
  text: questionTextSchema,
});

export type AddSessionQuestionInput = z.infer<typeof addSessionQuestionSchema>;

// === pinboard module ===

const stickyColorSchema = z.enum(['yellow', 'pink', 'blue', 'green']);

const stickyMarkSchema = z.object({
  from: z.number().int().min(0),
  to: z.number().int().min(0),
  style: z.enum(STICKY_MARK_STYLES),
});

const stickyLinkSchema = z.object({
  from: z.number().int().min(0),
  to: z.number().int().min(0),
  href: z.string().max(STICKY_HREF_MAX_LENGTH),
});

export const stickyArtifactSchema = z.object({
  type: z.literal('sticky'),
  text: z.string().max(2000),
  color: stickyColorSchema,
  marks: z.array(stickyMarkSchema).max(STICKY_MARK_LIMIT).optional(),
  lines: z.array(z.enum(STICKY_LINE_STYLES).nullable()).max(STICKY_LINE_LIMIT).optional(),
  levels: z
    .array(z.number().int().min(0).max(STICKY_LIST_MAX_LEVEL))
    .max(STICKY_LINE_LIMIT)
    .optional(),
  links: z.array(stickyLinkSchema).max(STICKY_LINK_LIMIT).optional(),
});

/**
 * A sticky as written: every range covers some of the note and none runs past
 * its end, there is no list style or nesting for a line the note does not have,
 * and every link opens a website, with no two links over the same words.
 *
 * Only on the way in. Reading stays tolerant, and the board clamps a range to
 * the text it has and draws no link it would not have accepted, so a stored
 * note is always shown rather than refused.
 */
export const stickyWriteArtifactSchema = stickyArtifactSchema.superRefine((value, context) => {
  value.marks?.forEach((mark, index) => {
    if (mark.from >= mark.to || mark.to > value.text.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Formatting must cover part of the note',
        path: ['marks', index],
      });
    }
  });
  const lineCount = value.text.split('\n').length;
  if (value.lines && value.lines.length > lineCount) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'A list style must be for a line of the note',
      path: ['lines'],
    });
  }
  if (value.levels && value.levels.length > lineCount) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Nesting must be for a line of the note',
      path: ['levels'],
    });
  }
  let reached = 0;
  (value.links ?? [])
    .map((link, index) => ({ link, index }))
    .sort((a, b) => a.link.from - b.link.from)
    .forEach(({ link, index }) => {
      if (link.from >= link.to || link.to > value.text.length || link.from < reached) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'A link must cover part of the note, and no other link',
          path: ['links', index],
        });
      }
      if (stickyLinkHref(link.href) !== link.href) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'A link must open a website',
          path: ['links', index, 'href'],
        });
      }
      reached = Math.max(reached, link.to);
    });
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

/**
 * Read shape for an imported picture: forgiving, like the other artifacts.
 *
 * The picture itself is not checked here — the card checks it again before
 * drawing it, with `isStorableImage`, and draws nothing if it fails.
 */
export const imageArtifactSchema = z.object({
  type: z.literal('image'),
  src: z.string().max(IMAGE_ARTIFACT_LIMIT),
  width: z.number(),
  height: z.number(),
});

/**
 * Write shape: a real picture, in an accepted format, within the limits.
 *
 * The size of the stored picture is checked against its bytes as well as its
 * label, and its dimensions are held to what the importer produces, so a
 * payload that skipped the importer cannot store a poster.
 */
const imageStrictArtifactSchema = z.object({
  type: z.literal('image'),
  src: z
    .string()
    .max(IMAGE_ARTIFACT_LIMIT, 'This image is too large to store')
    .refine(isStorableImage, 'This is not an image the board can show'),
  width: z.number().int().min(1).max(IMAGE_MAX_EDGE),
  height: z.number().int().min(1).max(IMAGE_MAX_EDGE),
});

export const imageWriteArtifactSchema = imageStrictArtifactSchema;

const diagramFillKeySchema = z.enum(DIAGRAM_FILL_KEYS);
const diagramStrokeKeySchema = z.enum(DIAGRAM_STROKE_KEYS);
const diagramStrokeWidthPresetSchema = z.enum(DIAGRAM_STROKE_WIDTH_PRESETS);
const diagramFontSizePresetSchema = z.enum(DIAGRAM_FONT_SIZE_PRESETS);
const diagramStrokeStyleSchema = z.enum(DIAGRAM_STROKE_STYLES);

// The strict node, used on the write path. Size bounds, the width/height pair
// rule and the container rules are added on top in diagramWriteArtifactSchema.
// v4.5 rotation: degrees clockwise about the element's own centre, one turn
// only. Shared by nodes, ink and paths — the three kinds that can be turned.
const diagramRotationSchema = z.number().min(0).lt(360);

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
  // Label styling, all optional: a node written before it existed still parses,
  // and reads as the plain centred label it has always been.
  labelBold: z.boolean().optional(),
  labelColor: diagramStrokeKeySchema.optional(),
  labelAlign: z.enum(DIAGRAM_TEXT_ALIGNS).optional(),
  // v4.5 rotation. Bounded rather than free: an angle outside one turn is
  // either a bug or a crafted payload, and normalising on read would hide both.
  rotation: diagramRotationSchema.optional(),
});

export const diagramEdgeSchema = z.object({
  from: z.string().min(1),
  to: z.string().min(1),
  label: z.string().max(200).optional(),
  strokeColor: diagramStrokeKeySchema.optional(),
  strokeWidthPreset: diagramStrokeWidthPresetSchema.optional(),
  strokeStyle: diagramStrokeStyleSchema.optional(),
});

// v4 ink. Both style fields are optional so a stroke written by a build with a
// wider palette still loads with the default appearance, exactly as nodes do.
export const inkElementSchema = z.object({
  id: z.string().min(1),
  // Packed `[x0, y0, x1, y1, …]`, like the drawing artifact's strokes: half the
  // characters for the same path, out of one shared artifact budget.
  points: z.array(z.number()).min(2).max(DIAGRAM_INK_POINT_LIMIT),
  strokeColor: diagramStrokeKeySchema.optional(),
  strokeWidthPreset: diagramStrokeWidthPresetSchema.optional(),
  rotation: diagramRotationSchema.optional(),
});

const pathHandleSchema = z.object({ x: z.number(), y: z.number() });

// v4 paths: the pen and line tools. Decoration only — a path never takes part
// in routing, layout or grouping the way a semantic `edge` does.
export const pathAnchorSchema = z.object({
  x: z.number(),
  y: z.number(),
  in: pathHandleSchema.optional(),
  out: pathHandleSchema.optional(),
});

export const pathElementSchema = z.object({
  id: z.string().min(1),
  // Two anchors is the minimum that draws anything: that is the line tool.
  anchors: z.array(pathAnchorSchema).min(2).max(DIAGRAM_PATH_ANCHOR_LIMIT),
  closed: z.boolean().optional(),
  strokeColor: diagramStrokeKeySchema.optional(),
  strokeWidthPreset: diagramStrokeWidthPresetSchema.optional(),
  strokeStyle: diagramStrokeStyleSchema.optional(),
  fillColor: diagramFillKeySchema.optional(),
  rotation: diagramRotationSchema.optional(),
});

// v4.2 arrows. An endpoint always carries a point and may also name the element
// it is bound to; the binding decides where the arrow is drawn, and the point is
// where it falls back to when that element is deleted.
const arrowEndpointSchema = z.object({
  x: z.number(),
  y: z.number(),
  elementId: z.string().min(1).optional(),
  // Where on the bound element to attach, as a fraction of its box. Bounded to
  // the box itself: a fraction outside it would put the arrow somewhere the
  // element is not, which no editor gesture can produce.
  at: z.object({ u: z.number().min(0).max(1), v: z.number().min(0).max(1) }).optional(),
});

export const arrowElementSchema = z.object({
  id: z.string().min(1),
  from: arrowEndpointSchema,
  to: arrowEndpointSchema,
  route: z.enum(ARROW_ROUTES).optional(),
  bend: z.number().min(-ARROW_MAX_BEND).max(ARROW_MAX_BEND).optional(),
  startCap: z.enum(ARROW_CAPS).optional(),
  endCap: z.enum(ARROW_CAPS).optional(),
  label: z.string().max(ARROW_LABEL_LIMIT).optional(),
  // A fraction of the route's length, so it holds its place when the arrow is
  // re-routed. Outside 0..1 would put the label off the end of its own line.
  labelT: z.number().min(0).max(1).optional(),
  labelSide: z.enum(ARROW_LABEL_SIDES).optional(),
  labelBold: z.boolean().optional(),
  labelColor: diagramStrokeKeySchema.optional(),
  fontSizePreset: diagramFontSizePresetSchema.optional(),
  strokeColor: diagramStrokeKeySchema.optional(),
  strokeWidthPreset: diagramStrokeWidthPresetSchema.optional(),
  strokeStyle: diagramStrokeStyleSchema.optional(),
});

export const tableCellSchema = z.object({
  text: z.string().max(TABLE_CELL_TEXT_LIMIT).optional(),
  fill: diagramFillKeySchema.optional(),
  align: z.enum(TABLE_CELL_ALIGNS).optional(),
  bold: z.boolean().optional(),
  color: diagramStrokeKeySchema.optional(),
  fontSizePreset: diagramFontSizePresetSchema.optional(),
});

// v4 tables. The cell array's length against the grid's dimensions is a write
// invariant rather than a shape rule, since it spans three fields.
export const tableElementSchema = z.object({
  id: z.string().min(1),
  x: z.number(),
  y: z.number(),
  colWidths: z
    .array(z.number().min(TABLE_MIN_COL_WIDTH).max(TABLE_MAX_COL_WIDTH))
    .min(1)
    .max(TABLE_MAX_COLS),
  rowHeights: z
    .array(z.number().min(TABLE_MIN_ROW_HEIGHT).max(TABLE_MAX_ROW_HEIGHT))
    .min(1)
    .max(TABLE_MAX_ROWS),
  cells: z.array(tableCellSchema).max(TABLE_MAX_ROWS * TABLE_MAX_COLS),
  headerRow: z.boolean().optional(),
  strokeColor: diagramStrokeKeySchema.optional(),
  strokeWidthPreset: diagramStrokeWidthPresetSchema.optional(),
  fontSizePreset: diagramFontSizePresetSchema.optional(),
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

/**
 * A v4 collection, read so that one unreadable element costs only itself.
 *
 * `z.array(x).catch(undefined)` drops the *array* when any element fails, so a
 * single stroke written by a build with a wider palette took every other stroke
 * on the canvas with it. That is the same shape of loss as the stroke that
 * exceeded the point cap and erased a whole drawing, and it is the one thing
 * the lenient read exists to prevent.
 *
 * The cap is still all-or-nothing: an array longer than the contract allows is
 * a payload no editor produced, so there is nothing to salvage from it.
 */
function lenientCollection<T extends z.ZodTypeAny>(schema: T, max: number) {
  return z
    .array(z.unknown())
    .max(max)
    .optional()
    .catch(undefined)
    .transform((items) =>
      items === undefined
        ? undefined
        : items.flatMap((item) => {
            const parsed = schema.safeParse(item);
            return parsed.success ? [parsed.data as z.infer<T>] : [];
          }),
    );
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
  // v4.1 label styling, lenient for the same reason everything above it is —
  // and more urgently, because `nodes` is the one collection with no fallback
  // of its own. A label alignment this build did not recognise failed the node,
  // which failed the whole artifact, which took the board card with it.
  labelBold: lenient(z.boolean()),
  labelColor: lenient(diagramStrokeKeySchema),
  labelAlign: lenient(z.enum(DIAGRAM_TEXT_ALIGNS)),
  // An unreadable angle drops to unrotated rather than failing the node, which
  // would fail the artifact and take the board card down with it.
  rotation: lenient(diagramRotationSchema),
});

const diagramReadEdgeSchema = diagramEdgeSchema.extend({
  strokeColor: lenient(diagramStrokeKeySchema),
  strokeWidthPreset: lenient(diagramStrokeWidthPresetSchema),
  strokeStyle: lenient(diagramStrokeStyleSchema),
});

const diagramReadTableSchema = tableElementSchema.extend({
  cells: z.array(
    tableCellSchema.extend({
      fill: lenient(diagramFillKeySchema),
      align: lenient(z.enum(TABLE_CELL_ALIGNS)),
      bold: lenient(z.boolean()),
      color: lenient(diagramStrokeKeySchema),
      fontSizePreset: lenient(diagramFontSizePresetSchema),
    }),
  ),
  headerRow: lenient(z.boolean()),
  strokeColor: lenient(diagramStrokeKeySchema),
  strokeWidthPreset: lenient(diagramStrokeWidthPresetSchema),
  fontSizePreset: lenient(diagramFontSizePresetSchema),
});

const diagramReadPathSchema = pathElementSchema.extend({
  closed: lenient(z.boolean()),
  rotation: lenient(diagramRotationSchema),
  strokeColor: lenient(diagramStrokeKeySchema),
  strokeWidthPreset: lenient(diagramStrokeWidthPresetSchema),
  strokeStyle: lenient(diagramStrokeStyleSchema),
  fillColor: lenient(diagramFillKeySchema),
});

const diagramReadArrowSchema = arrowElementSchema.extend({
  route: lenient(z.enum(ARROW_ROUTES)),
  labelSide: lenient(z.enum(ARROW_LABEL_SIDES)),
  startCap: lenient(z.enum(ARROW_CAPS)),
  endCap: lenient(z.enum(ARROW_CAPS)),
  labelColor: lenient(diagramStrokeKeySchema),
  fontSizePreset: lenient(diagramFontSizePresetSchema),
  strokeColor: lenient(diagramStrokeKeySchema),
  strokeWidthPreset: lenient(diagramStrokeWidthPresetSchema),
  strokeStyle: lenient(diagramStrokeStyleSchema),
});

const diagramReadInkSchema = inkElementSchema.extend({
  strokeColor: lenient(diagramStrokeKeySchema),
  strokeWidthPreset: lenient(diagramStrokeWidthPresetSchema),
  rotation: lenient(diagramRotationSchema),
});

/** Read shape. Stays a plain object so it can join a discriminated union. */
export const diagramArtifactSchema = z.object({
  type: z.literal('diagram'),
  nodes: z.array(diagramReadNodeSchema).max(100),
  edges: z.array(diagramReadEdgeSchema).max(200),
  // v4, and tolerant like everything else on the read path: ink or an order
  // this build cannot make sense of degrades to "no ink" / "legacy order"
  // rather than failing the parse and taking the whole board down.
  ink: lenientCollection(diagramReadInkSchema, DIAGRAM_INK_LIMIT),
  paths: lenientCollection(diagramReadPathSchema, DIAGRAM_PATH_LIMIT),
  tables: lenientCollection(diagramReadTableSchema, DIAGRAM_TABLE_LIMIT),
  arrows: lenientCollection(diagramReadArrowSchema, DIAGRAM_ARROW_LIMIT),
  z: z.array(z.string()).max(DIAGRAM_Z_LIMIT).optional().catch(undefined),
});

/** Write shape: every field must be one this build actually understands. */
const diagramStrictArtifactSchema = z.object({
  type: z.literal('diagram'),
  nodes: z.array(diagramNodeSchema).max(100),
  edges: z.array(diagramEdgeSchema).max(200),
  ink: z.array(inkElementSchema).max(DIAGRAM_INK_LIMIT).optional(),
  paths: z.array(pathElementSchema).max(DIAGRAM_PATH_LIMIT).optional(),
  tables: z.array(tableElementSchema).max(DIAGRAM_TABLE_LIMIT).optional(),
  arrows: z.array(arrowElementSchema).max(DIAGRAM_ARROW_LIMIT).optional(),
  z: z.array(z.string().min(1)).max(DIAGRAM_Z_LIMIT).optional(),
});

export const diagramWriteArtifactSchema = diagramStrictArtifactSchema.superRefine(
  // `z` is destructured under another name: it would otherwise shadow the zod
  // import for the whole refinement.
  ({ nodes, edges, ink, paths, tables, arrows, z: paintOrder }, context) => {
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

      const key = diagramEdgeKey(edge);
      if (edgeKeys.has(key)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Duplicate directed edges are not allowed',
          path: ['edges', index],
        });
      }
      edgeKeys.add(key);
    });

    // --- v4 invariants ----------------------------------------------------
    //
    // `z` is one flat order over three kinds of element, so their keys have to
    // be unique as a set, not just within each kind.

    const inkIds = new Set<string>();
    (ink ?? []).forEach((stroke, index) => {
      if (inkIds.has(stroke.id) || nodeIds.has(stroke.id) || edgeKeys.has(stroke.id)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Element ids must be unique across nodes, edges and ink',
          path: ['ink', index, 'id'],
        });
      }
      inkIds.add(stroke.id);
    });

    const pathIds = new Set<string>();
    (paths ?? []).forEach((path, index) => {
      if (
        pathIds.has(path.id) ||
        nodeIds.has(path.id) ||
        edgeKeys.has(path.id) ||
        inkIds.has(path.id)
      ) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Element ids must be unique across nodes, edges, ink and paths',
          path: ['paths', index, 'id'],
        });
      }
      pathIds.add(path.id);

      // An open path has nothing to fill, so a fill on one is a payload that
      // could not have come from the editor.
      if (path.fillColor !== undefined && path.closed !== true) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Only a closed path can carry a fill',
          path: ['paths', index, 'fillColor'],
        });
      }
    });

    const tableIds = new Set<string>();
    (tables ?? []).forEach((table, index) => {
      if (
        tableIds.has(table.id) ||
        nodeIds.has(table.id) ||
        edgeKeys.has(table.id) ||
        inkIds.has(table.id) ||
        pathIds.has(table.id)
      ) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Element ids must be unique across every kind of element',
          path: ['tables', index, 'id'],
        });
      }
      tableIds.add(table.id);

      // The cell array is the grid: a mismatch would leave rows without cells
      // or cells without a row, and every reader would disagree about which.
      const expected = table.rowHeights.length * table.colWidths.length;
      if (table.cells.length !== expected) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `A table needs exactly one cell per column per row (expected ${expected})`,
          path: ['tables', index, 'cells'],
        });
      }
    });

    const arrowIds = new Set<string>();
    (arrows ?? []).forEach((arrow, index) => {
      if (
        arrowIds.has(arrow.id) ||
        nodeIds.has(arrow.id) ||
        edgeKeys.has(arrow.id) ||
        inkIds.has(arrow.id) ||
        pathIds.has(arrow.id) ||
        tableIds.has(arrow.id)
      ) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Element ids must be unique across every kind of element',
          path: ['arrows', index, 'id'],
        });
      }
      arrowIds.add(arrow.id);

      // An arrow may bind to anything with an outline to land on. It may not
      // bind to another arrow: two arrows bound to each other would each need
      // the other's route resolved first, and nothing could draw either.
      const bindable = new Set<string>([...nodeIds, ...inkIds, ...pathIds, ...tableIds]);
      for (const end of ['from', 'to'] as const) {
        const elementId = arrow[end].elementId;
        if (elementId !== undefined && !bindable.has(elementId)) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'An arrow endpoint must be bound to an element this diagram contains',
            path: ['arrows', index, end, 'elementId'],
          });
        }
      }

      // Both ends on one element is a self-loop: it draws as a loop around
      // that element rather than a line across it, which is an ordinary thing
      // to want to say about a thing, so it is deliberately allowed.

      // `bend` slides an elbow's middle leg. A straight arrow has no middle
      // leg, so a bend on one is a value no editor gesture can produce.
      if (arrow.bend !== undefined && arrow.route !== 'elbow') {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Only an elbowed arrow can carry a bend',
          path: ['arrows', index, 'bend'],
        });
      }
    });

    if (paintOrder !== undefined) {
      const known = new Set<string>([
        ...nodeIds,
        ...edgeKeys,
        ...inkIds,
        ...pathIds,
        ...tableIds,
        ...arrowIds,
      ]);
      const seen = new Set<string>();

      paintOrder.forEach((key, index) => {
        if (!known.has(key)) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'Paint order must only name elements this diagram contains',
            path: ['z', index],
          });
        }
        if (seen.has(key)) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'An element may appear in the paint order only once',
            path: ['z', index],
          });
        }
        seen.add(key);
      });

      // A container is a backdrop for what it holds. Painting one after its own
      // descendant would cover the descendant up, which no editor gesture can
      // produce but a crafted payload can. `studioPaintOrder` appends anything
      // `z` omits, so only pairs `z` actually names can be checked here.
      const rank = new Map(paintOrder.map((key, index) => [key, index]));
      nodes.forEach((node, index) => {
        const nodeRank = rank.get(node.id);
        if (nodeRank === undefined || !node.parentId) return;
        const parentRank = rank.get(node.parentId);
        if (parentRank === undefined) return;
        if (parentRank > nodeRank && diagramIsAncestor(nodes, node.parentId, node.id)) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'A container must be painted before the nodes it holds',
            path: ['nodes', index, 'parentId'],
          });
        }
      });
    }
  },
);

/** What a stored row is parsed with: tolerant of values it does not recognise. */
export const artifactJsonSchema = z.discriminatedUnion('type', [
  stickyArtifactSchema,
  drawingArtifactSchema,
  diagramArtifactSchema,
  imageArtifactSchema,
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
  imageStrictArtifactSchema,
]);

export const proposalTypeSchema = z.enum(['sticky', 'drawing', 'diagram', 'image']);

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
          : value.artifactJson.type === 'image'
            ? imageWriteArtifactSchema
            : stickyWriteArtifactSchema;

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
          : value.artifactJson?.type === 'sticky'
            ? stickyWriteArtifactSchema
            : value.artifactJson?.type === 'image'
              ? imageWriteArtifactSchema
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

/**
 * Restack contract: bring a card to the front of the board, or send it to the
 * back.
 *
 * The client names a direction, never a number. The server works out the new
 * value from what is stored, so two leaders' tabs arranging at once cannot
 * write stale positions over each other, and its own intent rather than a
 * field on `proposalUpdate` because it carries a different permission: only
 * the leader arranges the shared board.
 */
export const proposalArrangeSchema = z.object({
  id: z.string().min(1),
  to: z.enum(['front', 'back']),
});

export type ProposalArrangeInput = z.infer<typeof proposalArrangeSchema>;

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

// === voting module ===

export const shortlistToggleSchema = z.object({
  proposalId: z.string().min(1),
});

export type ShortlistToggleInput = z.infer<typeof shortlistToggleSchema>;

/** Empty body: session and leader come from the socket, not the payload. */
export const emptyVotingIntentSchema = z.object({});

export type EmptyVotingIntent = z.infer<typeof emptyVotingIntentSchema>;

export const voteCastSchema = z.object({
  proposalId: z.string().min(1),
});

export type VoteCastInput = z.infer<typeof voteCastSchema>;
