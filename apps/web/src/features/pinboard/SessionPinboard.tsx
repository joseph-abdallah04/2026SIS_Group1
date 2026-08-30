import { useParams } from 'react-router-dom';

import { PinboardCanvas } from './PinboardCanvas';
import { usePinboard } from './usePinboard';

export function SessionPinboard() {
  const { id } = useParams<{ id: string }>();
  const sessionId = id ?? '';
  const { board, loading, error } = usePinboard(sessionId);

  if (!sessionId) {
    return <p className="p-6 text-red-600">Missing session id.</p>;
  }

  if (loading) {
    return (
      <main className="flex h-screen items-center justify-center bg-slate-100">
        <p className="text-slate-600">Loading pinboard…</p>
      </main>
    );
  }

  if (error) {
    return (
      <main className="flex h-screen items-center justify-center bg-slate-100">
        <p className="text-red-600">{error}</p>
      </main>
    );
  }

  if (!board) {
    return (
      <main className="flex h-screen items-center justify-center bg-slate-100">
        <p className="text-slate-600">Board unavailable.</p>
      </main>
    );
  }

  return (
    <main className="h-screen">
      <PinboardCanvas board={board} />
    </main>
  );
}
