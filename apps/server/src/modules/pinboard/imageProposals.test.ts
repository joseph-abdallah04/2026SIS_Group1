import { IMAGE_MAX_EDGE, parseArtifact } from '@roundtable/shared';
import { proposalCreateSchema, proposalUpdateSchema } from '@roundtable/shared/schemas';
import { describe, expect, it } from 'vitest';

/** A real 1x1 PNG. */
const PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

/**
 * The start of a PNG whose header says it is `width` by `height`: what every
 * viewer's decoder would believe, and allocate for.
 */
function pngClaiming(width: number, height: number): string {
  const header = Buffer.alloc(33);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(header, 0);
  header.writeUInt32BE(13, 8);
  header.write('IHDR', 12, 'ascii');
  header.writeUInt32BE(width, 16);
  header.writeUInt32BE(height, 20);
  header[24] = 8;
  header[25] = 6;
  return `data:image/png;base64,${header.toString('base64')}`;
}

function create(artifactJson: Record<string, unknown>, type = 'image') {
  return proposalCreateSchema.safeParse({ type, artifactJson, x: 100, y: 100 });
}

describe('image proposals', () => {
  it('accepts a picture the importer would produce', () => {
    const parsed = create({ type: 'image', src: PNG, width: 1, height: 1 });
    expect(parsed.success).toBe(true);
  });

  // Nothing but a checked data URL is stored: an address would have every
  // viewer's browser fetch from it, and an SVG is markup, not a picture.
  it.each([
    ['an address', 'https://example.com/tracker.png'],
    ['an SVG', 'data:image/svg+xml;base64,PHN2ZyBvbmxvYWQ9YWxlcnQoMSk+'],
    ['a mislabelled file', 'data:image/png;base64,/9j/4AAQSkZJRgABAQAAAQABAAD'],
  ])('refuses %s', (_, src) => {
    expect(create({ type: 'image', src, width: 1, height: 1 }).success).toBe(false);
  });

  it('refuses dimensions the importer never produces', () => {
    const tooWide = create({ type: 'image', src: PNG, width: IMAGE_MAX_EDGE + 1, height: 1 });
    const fractional = create({ type: 'image', src: PNG, width: 1.5, height: 1 });
    expect(tooWide.success).toBe(false);
    expect(fractional.success).toBe(false);
  });

  // A few hundred kilobytes of PNG can ask every viewer to decode a poster.
  // What the proposal says about its size is not what gets decoded; the
  // picture's own header is.
  it('refuses a picture whose header asks for more than the board keeps', () => {
    const poster = pngClaiming(20_000, 20_000);
    expect(create({ type: 'image', src: poster, width: 1, height: 1 }).success).toBe(false);
  });

  it('refuses a picture that is not the size it says it is', () => {
    expect(create({ type: 'image', src: PNG, width: 800, height: 600 }).success).toBe(false);
    const wide = pngClaiming(1200, 675);
    expect(create({ type: 'image', src: wide, width: 1200, height: 675 }).success).toBe(true);
  });

  // Pictures carry no caption, like every other proposal: one sent anyway is
  // not stored, rather than riding along unseen on the row.
  it('does not store a caption', () => {
    const parsed = create({ type: 'image', src: PNG, width: 1, height: 1, caption: 'Our wall' });
    expect(parsed.success).toBe(true);
    expect(parsed.data?.artifactJson).not.toHaveProperty('caption');
  });

  // The column and the artifact must agree, as for every other kind.
  it('refuses a picture filed as a sticky', () => {
    expect(create({ type: 'image', src: PNG, width: 1, height: 1 }, 'sticky').success).toBe(false);
  });

  it('holds an edit to the same rules as a create', () => {
    const edit = proposalUpdateSchema.safeParse({
      id: 'p1',
      artifactJson: { type: 'image', src: 'https://example.com/x.png', width: 1, height: 1 },
    });
    expect(edit.success).toBe(false);
  });

  // A picture is something a person brings; the assistant has none of its own.
  it('is never something the assistant can propose', () => {
    const result = parseArtifact({ type: 'image', src: PNG, width: 1, height: 1 });
    expect(result.ok).toBe(false);
  });
});
