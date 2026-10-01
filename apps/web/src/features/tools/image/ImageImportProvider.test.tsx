import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const tools = {
  isLive: true,
  submissionStatus: 'idle',
  activeTool: null as string | null,
  closeTool: vi.fn(() => true),
  proposeArtifact: vi.fn(),
};

vi.mock('../CreativeToolsContext', () => ({ useCreativeTools: () => tools }));
// The dialog decodes and crops; all that matters here is which file it opened with.
vi.mock('./ImageImportDialog', () => ({
  ImageImportDialog: ({ file }: { file: File }) => <div role="dialog">Framing {file.name}</div>,
}));

const { ImageImportProvider, pastedImage } = await import('./ImageImportProvider');

const screenshot = new File(['png'], 'screenshot.png', { type: 'image/png' });

/** What a clipboard hands a paste: its files, its items, and the kinds of data it holds. */
function clipboard({
  files = [] as File[],
  items = [] as File[],
  text = false,
} = {}): DataTransfer {
  return {
    files,
    items: items.map((file) => ({ kind: 'file', type: file.type, getAsFile: () => file })),
    types: [...(files.length || items.length ? ['Files'] : []), ...(text ? ['text/plain'] : [])],
  } as unknown as DataTransfer;
}

function paste(data: DataTransfer, target: EventTarget = document.body) {
  const event = new Event('paste', { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'clipboardData', { value: data });
  act(() => {
    target.dispatchEvent(event);
  });
  return event;
}

afterEach(() => {
  tools.activeTool = null;
});

describe('pasting a picture onto the board', () => {
  it('opens the importer for a pasted screenshot', () => {
    render(<ImageImportProvider>{null}</ImageImportProvider>);

    const event = paste(clipboard({ files: [screenshot] }));

    expect(screen.getByRole('dialog')).toHaveTextContent('Framing screenshot.png');
    expect(event.defaultPrevented).toBe(true);
  });

  // Some browsers and apps put a copied picture only among the items.
  it('finds a picture that is only among the clipboard’s items', () => {
    render(<ImageImportProvider>{null}</ImageImportProvider>);

    paste(clipboard({ items: [screenshot] }));

    expect(screen.getByRole('dialog')).toHaveTextContent('Framing screenshot.png');
  });

  // A text field cannot take a picture, so leaving it there lost the paste.
  it('takes a picture pasted while a text field has focus', () => {
    render(
      <ImageImportProvider>
        <input aria-label="Add a question" />
      </ImageImportProvider>,
    );
    const field = screen.getByRole('textbox', { name: 'Add a question' });
    field.focus();

    paste(clipboard({ files: [screenshot] }), field);

    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('leaves a paste with words in it to the text field', () => {
    render(
      <ImageImportProvider>
        <input aria-label="Add a question" />
      </ImageImportProvider>,
    );
    const field = screen.getByRole('textbox', { name: 'Add a question' });
    field.focus();

    const event = paste(clipboard({ files: [screenshot], text: true }), field);

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(event.defaultPrevented).toBe(false);
  });

  // An open editor has its own idea of what a paste means.
  it('leaves a paste alone while an editor is open', () => {
    tools.activeTool = 'sticky';
    render(<ImageImportProvider>{null}</ImageImportProvider>);

    paste(clipboard({ files: [screenshot] }));

    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('ignores a paste with no picture in it', () => {
    render(<ImageImportProvider>{null}</ImageImportProvider>);

    const event = paste(clipboard({ text: true }));

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(event.defaultPrevented).toBe(false);
  });
});

describe('pastedImage', () => {
  it('prefers the clipboard’s files, and passes over anything that is not a picture', () => {
    const notes = new File(['hi'], 'notes.txt', { type: 'text/plain' });
    expect(pastedImage(clipboard({ files: [notes, screenshot] }))).toBe(screenshot);
    expect(pastedImage(clipboard({ files: [notes] }))).toBeNull();
    expect(pastedImage(null)).toBeNull();
  });
});
