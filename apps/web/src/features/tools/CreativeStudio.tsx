import { DiagramEditor } from './diagram/DiagramEditor';
import { DrawingEditor } from './drawing/DrawingEditor';
import { StickyEditor } from './sticky/StickyEditor';
import { StudioOverlay } from './StudioOverlay';
import { TOOL_LABELS } from './toolRegistry';
import { useCreativeTools } from './CreativeToolsContext';

export function CreativeStudio() {
  const { activeTool, closeTool, editSource, extensionSource, isReusingOwn, isLive } =
    useCreativeTools();
  if (!activeTool) return null;

  // A sticky is one line of text and a colour, so it is written in a popup
  // over the board rather than in a room of its own: leaving the board to
  // write a sentence costs more than the sentence. It brings its own dialog,
  // and its own header, because it has no studio chrome to hang one on.
  // Keyed by what it opened on, so moving from one source to another is a new
  // popup with its own note rather than the last one's text under a new label.
  if (activeTool === 'sticky') {
    return <StickyEditor key={editSource?.id ?? extensionSource?.id ?? 'new'} />;
  }

  // Reuse (F38) and Extend (F23) share one write path, so the source alone
  // says which is happening, and this title is the only label the drawing
  // and diagram tools share: the drawing editor has a toolbar where the
  // diagram editor has a banner.
  const action = editSource
    ? 'Edit'
    : extensionSource
      ? isReusingOwn
        ? 'Reuse'
        : 'Extend'
      : 'New';
  const title = `${action} ${TOOL_LABELS[activeTool].toLowerCase()}`;

  return (
    <StudioOverlay isLive={isLive} onClose={closeTool} title={title}>
      {activeTool === 'drawing' ? <DrawingEditor /> : null}
      {activeTool === 'diagram' ? <DiagramEditor /> : null}
    </StudioOverlay>
  );
}
