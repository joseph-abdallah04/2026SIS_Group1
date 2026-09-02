import { Construction } from 'lucide-react';

import { Button } from '../../components/ui/Button';
import { StickyEditor } from './sticky/StickyEditor';
import { StudioOverlay } from './StudioOverlay';
import { TOOL_LABELS } from './toolRegistry';
import { useCreativeTools } from './CreativeToolsContext';

export function CreativeStudio() {
  const { activeTool, closeTool, extensionSource, isLive } = useCreativeTools();
  if (!activeTool) return null;

  const action = extensionSource ? 'Extend' : 'New';
  const title = `${action} ${TOOL_LABELS[activeTool].toLowerCase()}`;

  return (
    <StudioOverlay isLive={isLive} onClose={closeTool} title={title}>
      {activeTool === 'sticky' ? (
        <StickyEditor />
      ) : (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 bg-rt-surface-sunken px-6 text-center">
          <Construction aria-hidden="true" className="text-rt-primary-deep" size={30} />
          <h2 className="text-[18px] font-semibold text-rt-ink">
            {TOOL_LABELS[activeTool]} editor is not available yet
          </h2>
          <Button variant="secondary" onClick={closeTool}>
            Back to pinboard
          </Button>
        </div>
      )}
    </StudioOverlay>
  );
}
