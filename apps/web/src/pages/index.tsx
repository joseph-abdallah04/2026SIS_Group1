// Placeholder pages — smoke-test targets (docs/05 §10). Owners replace with real UI.
//
// SettingsPage is real: it hosts the AI provider form (F33). `/sessions/:id` is routed to
// the pinboard's own view in App.tsx, which is where the assistant bubble mounts.
import { Link } from 'react-router-dom';

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
  return (
    <main className="flex h-screen items-center justify-center">
      <h1 className="text-2xl font-bold">Session</h1>
    </main>
  );
}

export function SettingsPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <div className="mb-8 flex items-baseline justify-between">
        <h1 className="text-2xl font-bold text-rt-ink">Settings</h1>
        <Link to="/dashboard" className="text-sm text-rt-primary-deep hover:underline">
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
