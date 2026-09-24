/** A real 1x1 PNG, for tests that need a picture the board will draw. */
export const TINY_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

/** A real 1x1 WebP — a picture the board refuses to store. */
export const TINY_WEBP =
  'data:image/webp;base64,UklGRiQAAABXRUJQVlA4IBgAAAAwAQCdASoBAAEAAwA0JaQAA3AA/vuUAAA=';

/** A real 8x8 JPEG, as the importer writes one: a colour profile, then the frame. */
export const TINY_JPEG =
  'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/4gHYSUNDX1BST0ZJTEUAAQEAAAHIAAAAAAQwAABtbnRyUkdCIFhZWiAH4AABAAEAAAAAAABhY3NwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQAA9tYAAQAAAADTLQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAlkZXNjAAAA8AAAACRyWFlaAAABFAAAABRnWFlaAAABKAAAABRiWFlaAAABPAAAABR3dHB0AAABUAAAABRyVFJDAAABZAAAAChnVFJDAAABZAAAAChiVFJDAAABZAAAAChjcHJ0AAABjAAAADxtbHVjAAAAAAAAAAEAAAAMZW5VUwAAAAgAAAAcAHMAUgBHAEJYWVogAAAAAAAAb6IAADj1AAADkFhZWiAAAAAAAABimQAAt4UAABjaWFlaIAAAAAAAACSgAAAPhAAAts9YWVogAAAAAAAA9tYAAQAAAADTLXBhcmEAAAAAAAQAAAACZmYAAPKnAAANWQAAE9AAAApbAAAAAAAAAABtbHVjAAAAAAAAAAEAAAAMZW5VUwAAACAAAAAcAEcAbwBvAGcAbABlACAASQBuAGMALgAgADIAMAAxADb/2wBDAAQDAwQDAwQEBAQFBQQFBwsHBwYGBw4KCggLEA4RERAOEA8SFBoWEhMYEw8QFh8XGBsbHR0dERYgIh8cIhocHRz/2wBDAQUFBQcGBw0HBw0cEhASHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBz/wAARCAAIAAgDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAf/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAABgj/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCWgBimH//Z';

function dataUrl(format: 'png' | 'jpeg', bytes: number[]): string {
  return `data:image/${format};base64,${btoa(String.fromCharCode(...bytes))}`;
}

function bigEndian(value: number, size: 2 | 4): number[] {
  return Array.from({ length: size }, (_, index) => (value >>> ((size - 1 - index) * 8)) & 0xff);
}

/**
 * The start of a PNG that says it is `width` by `height`. Only the header, but
 * the header is what a decoder believes, and what it allocates for.
 */
export function pngClaiming(width: number, height: number): string {
  return dataUrl('png', [
    ...[0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
    ...bigEndian(13, 4),
    ...[0x49, 0x48, 0x44, 0x52],
    ...bigEndian(width, 4),
    ...bigEndian(height, 4),
    ...[8, 6, 0, 0, 0],
    ...[0, 0, 0, 0],
  ]);
}

/** The start of a JPEG that says it is `width` by `height`, after a JFIF segment. */
export function jpegClaiming(width: number, height: number): string {
  return dataUrl('jpeg', [
    ...[0xff, 0xd8],
    ...[0xff, 0xe0, ...bigEndian(16, 2), 0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0],
    ...[0xff, 0xc0, ...bigEndian(17, 2), 8, ...bigEndian(height, 2), ...bigEndian(width, 2), 3],
    ...[1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1],
    ...[0xff, 0xd9],
  ]);
}
