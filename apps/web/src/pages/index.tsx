import { useNavigate } from 'react-router-dom';

import { Button } from '../components/ui/Button';
import { logout } from '../features/auth/api';
import { clearToken } from '../lib/auth';

// Placeholder pages — smoke-test targets (docs/05 §10). Owners replace with real UI.
export { LoginPage } from '../features/auth/LoginPage';
export { SignupPage } from '../features/auth/SignupPage';

// Real layout is the Session Lifecycle owner's ticket (F07) — the "Log out"
// button is a temporary graft so F02's logout flow has somewhere to be
// triggered from; it goes away when this placeholder is replaced wholesale.
export function DashboardPage() {
  const navigate = useNavigate();

  async function onLogout() {
    try {
      await logout();
    } finally {
      clearToken();
      navigate('/login', { replace: true });
    }
  }

  return (
    <main className="flex h-screen flex-col items-center justify-center gap-4">
      <h1 className="text-2xl font-bold">Dashboard</h1>
      <Button variant="secondary" onClick={onLogout}>
        Log out
      </Button>
    </main>
  );
}

export function SessionPage() {
  return <main className="flex h-screen items-center justify-center"><h1 className="text-2xl font-bold">Session</h1></main>;
}

export function SettingsPage() {
  return <main className="flex h-screen items-center justify-center"><h1 className="text-2xl font-bold">Settings</h1></main>;
}

export function NotFoundPage() {
  return <main className="flex h-screen items-center justify-center"><h1 className="text-2xl font-bold">404</h1></main>;
}
