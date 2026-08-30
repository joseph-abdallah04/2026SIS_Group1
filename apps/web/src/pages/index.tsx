// Placeholder pages — smoke-test targets (docs/05 §10). Owners replace with real UI.
//
// Two of them now have real content, from the AI Assistant owner's tickets:
//   - SettingsPage hosts the LLM provider form (F33).
//   - SessionPage mounts the assistant bubble (F34) alongside the placeholder, so it keeps
//     working when the Pinboard/Session owners build the real session layout around it.
import { useCallback } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { AssistantContext } from '@roundtable/shared';

import { AssistantBubble } from '../features/assistant';
import { LlmSettingsForm } from '../features/settings';

export function LoginPage() {
  return (
    <main className="flex h-screen items-center justify-center">
      <h1 className="text-2xl font-bold">Log in</h1>
    </main>
  );
}

export function SignupPage() {
  return (
    <main className="flex h-screen items-center justify-center">
      <h1 className="text-2xl font-bold">Sign up</h1>
    </main>
  );
}

export function DashboardPage() {
  return (
    <main className="flex h-screen items-center justify-center">
      <h1 className="text-2xl font-bold">Dashboard</h1>
    </main>
  );
}

export function SessionPage() {
  const { id } = useParams<{ id: string }>();

  /**
   * What the assistant is told about the session (F35).
   *
   * SESSION / PINBOARD OWNERS: this is the integration point. Replace the body with the
   * live values from your stores — active question and its id, current phase, the selected
   * proposal, and a short summary of recent proposals — and the agent's answers become
   * session-aware with no change inside the assistant feature.
   */
  const getAssistantContext = useCallback<() => AssistantContext>(() => ({}), []);

  return (
    <main className="relative h-screen">
      <div className="flex h-full items-center justify-center">
        <h1 className="text-2xl font-bold">Session</h1>
      </div>
      {id && <AssistantBubble sessionId={id} getContext={getAssistantContext} />}
    </main>
  );
}

export function SettingsPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <div className="mb-8 flex items-baseline justify-between">
        <h1 className="text-2xl font-bold text-slate-900">Settings</h1>
        <Link to="/dashboard" className="text-sm text-indigo-600 hover:underline">
          Back to dashboard
        </Link>
      </div>
      <LlmSettingsForm />
    </main>
  );
}

export function NotFoundPage() {
  return (
    <main className="flex h-screen items-center justify-center">
      <h1 className="text-2xl font-bold">404</h1>
    </main>
  );
}
