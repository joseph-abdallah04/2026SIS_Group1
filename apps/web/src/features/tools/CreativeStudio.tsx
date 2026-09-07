import { DiagramEditor } from './diagram/DiagramEditor';
import { DrawingEditor } from './drawing/DrawingEditor';
import { StickyEditor } from './sticky/StickyEditor';
import { StudioOverlay } from './StudioOverlay';
import { TOOL_LABELS } from './toolRegistry';
import { useCreativeTools } from './CreativeToolsContext';

export function CreativeStudio() {
  const { activeTool, closeTool, editSource, extensionSource, isLive } = useCreativeTools();
  if (!activeTool) return null;

  const action = editSource ? 'Edit' : extensionSource ? 'Extend' : 'New';
  const title = `${action} ${TOOL_LABELS[activeTool].toLowerCase()}`;

  return (
    <StudioOverlay isLive={isLive} onClose={closeTool} title={title}>
      {activeTool === 'sticky' ? <StickyEditor /> : null}
      {activeTool === 'drawing' ? <DrawingEditor /> : null}
      {activeTool === 'diagram' ? <DiagramEditor /> : null}
    </StudioOverlay>
  );
}
