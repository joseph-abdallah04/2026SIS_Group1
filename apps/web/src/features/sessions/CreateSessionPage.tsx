import { useNavigate } from 'react-router-dom';

import { RoundTableLogo } from '../../components/RoundTableLogo';
import { CreateSessionForm } from './CreateSessionForm';

export function CreateSessionPage() {
  const navigate = useNavigate();

  return (
    <main className="flex min-h-screen flex-col bg-rt-surface text-rt-ink">
      <header className="flex shrink-0 items-center gap-4 border-b border-rt-primary-tint bg-rt-primary px-6 py-[13px] text-white">
        <RoundTableLogo />
        <span className="text-[13px] font-semibold tracking-[-0.01em]">New session</span>
      </header>
      <div className="flex flex-1 justify-center px-6 py-10">
        <CreateSessionForm onCreated={(id) => navigate(`/sessions/${id}`, { replace: true })} />
      </div>
    </main>
  );
}
