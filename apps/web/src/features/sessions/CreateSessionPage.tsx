import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { RoundTableLogo } from '../../components/RoundTableLogo';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { CreateSessionForm } from './CreateSessionForm';

export function CreateSessionPage() {
  const navigate = useNavigate();
  const [confirmingLeave, setConfirmingLeave] = useState(false);

  function goToDashboard() {
    navigate('/dashboard');
  }

  return (
    <main className="flex min-h-screen flex-col bg-rt-surface text-rt-ink">
      <header className="flex shrink-0 items-center gap-4 border-b border-rt-secondary/40 bg-rt-primary px-6 py-[13px] text-rt-ink">
        <RoundTableLogo />
        <span className="text-[13px] font-semibold tracking-[-0.01em]">New session</span>
        <button
          type="button"
          onClick={() => setConfirmingLeave(true)}
          className="ml-auto text-[12px] font-semibold text-rt-ink/70 hover:text-rt-ink hover:underline"
        >
          Dashboard
        </button>
      </header>
      <div className="flex flex-1 justify-center px-6 py-10">
        <CreateSessionForm
          onCreated={(id) => navigate(`/sessions/${id}`, { replace: true })}
          onCancel={() => setConfirmingLeave(true)}
        />
      </div>
      {confirmingLeave && (
        <ConfirmDialog
          title="Discard this session?"
          confirmLabel="Discard"
          onConfirm={goToDashboard}
          onCancel={() => setConfirmingLeave(false)}
        >
          Nothing has been saved. The title and questions you've entered will be lost.
        </ConfirmDialog>
      )}
    </main>
  );
}
