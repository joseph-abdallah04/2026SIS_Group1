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

  // Reuse (F38) and Extend (F23) share one write path, so the source alone
  // says which is happening, and this title is the only label every tool
  // shows: the drawing editor has a toolbar where the others have a banner.
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
      {activeTool === 'sticky' ? <StickyEditor /> : null}
      {activeTool === 'drawing' ? <DrawingEditor /> : null}
      {activeTool === 'diagram' ? <DiagramEditor /> : null}
    </StudioOverlay>
  );
}
