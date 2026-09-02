import { useEffect, useRef, type ReactNode } from 'react';
import { ArrowLeft, Wifi, WifiOff } from 'lucide-react';

import { IconButton } from '../../components/ui/IconButton';

interface StudioOverlayProps {
  children: ReactNode;
  isLive: boolean;
  onClose: () => void;
  title: string;
}

export function StudioOverlay({ children, isLive, onClose, title }: StudioOverlayProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog || dialog.open) return;
    dialog.showModal();
    return () => {
      if (dialog.open) dialog.close();
    };
  }, []);

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="creative-studio-title"
      className="m-0 h-dvh max-h-none w-screen max-w-none overflow-hidden border-0 bg-rt-surface p-0 text-rt-ink backdrop:bg-rt-ink/35"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <div className="flex h-full min-h-0 flex-col">
        <header className="flex min-h-16 shrink-0 items-center gap-3 border-b border-rt-primary-deep bg-rt-primary px-4 text-white sm:px-6">
          <IconButton label="Back to pinboard" tone="inverse" onClick={onClose}>
            <ArrowLeft aria-hidden="true" size={19} strokeWidth={1.8} />
          </IconButton>
          <div className="min-w-0">
            <p className="text-[9px] font-semibold tracking-[0.14em] text-white/75 uppercase">
              Creative studio
            </p>
            <h1 id="creative-studio-title" className="truncate text-[17px] font-semibold">
              {title}
            </h1>
          </div>
          <div
            className={`ml-auto flex h-8 items-center gap-2 rounded-full border px-3 text-[11px] font-semibold ${
              isLive
                ? 'border-white/35 bg-white/15 text-white'
                : 'border-rt-secondary-tint bg-rt-secondary-wash text-rt-secondary-deep'
            }`}
            role="status"
          >
            {isLive ? (
              <Wifi aria-hidden="true" size={14} />
            ) : (
              <WifiOff aria-hidden="true" size={14} />
            )}
            <span>{isLive ? 'Live' : 'Offline'}</span>
          </div>
        </header>
        {children}
      </div>
    </dialog>
  );
}
