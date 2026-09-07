import { Link, useNavigate } from 'react-router-dom';

import { Button } from '../components/ui/Button';
import { logout } from '../features/auth/api';
import { clearToken } from '../lib/auth';
import { disconnectSocket } from '../lib/socket';

// Placeholder pages — smoke-test targets (docs/05 §10). Owners replace with real UI.
export { LoginPage } from '../features/auth/LoginPage';
export { SignupPage } from '../features/auth/SignupPage';

// Real layout is the Session Lifecycle owner's ticket (F07) — the "Log out"
// button and "Profile" link are temporary grafts so F02's logout flow and
// F03's profile page have somewhere to be reached from; they go away when
// this placeholder is replaced wholesale.
export function DashboardPage() {
  const navigate = useNavigate();

  async function onLogout() {
    try {
      await logout();
    } finally {
      clearToken();
      // Drop the socket singleton too — otherwise a same-tab login as someone
      // else would keep the previous identity's live connection around.
      disconnectSocket();
      navigate('/login', { replace: true });
    }
  }

  return (
    <main className="flex h-screen flex-col items-center justify-center gap-4">
      <h1 className="text-2xl font-bold">Dashboard</h1>
      <div className="flex gap-3">
        <Link to="/settings">
          <Button variant="secondary">Profile</Button>
        </Link>
        <Button variant="secondary" onClick={onLogout}>
          Log out
        </Button>
      </div>
    </main>
  );
}

export function SessionPage() {
  return <main className="flex h-screen items-center justify-center"><h1 className="text-2xl font-bold">Session</h1></main>;
}

export { SettingsPage } from '../features/settings/SettingsPage';

export function NotFoundPage() {
  return <main className="flex h-screen items-center justify-center"><h1 className="text-2xl font-bold">404</h1></main>;
}
