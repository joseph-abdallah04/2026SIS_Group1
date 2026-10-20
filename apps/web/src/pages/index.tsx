// F01/F02 own these screens, and the dashboard lives in its own feature; they
// are re-exported here so `App.tsx` keeps importing every page from one barrel.
export { LoginPage } from '../features/auth/LoginPage';
export { SignupPage } from '../features/auth/SignupPage';
export { LandingPage } from '../features/marketing/LandingPage';
export { DashboardPage } from '../features/dashboard/DashboardPage';

export function SessionPage() {
  return (
    <main className="flex h-screen items-center justify-center">
      <h1 className="text-2xl font-bold">Session</h1>
    </main>
  );
}

export { SettingsPage } from '../features/settings/SettingsPage';

export function NotFoundPage() {
  return (
    <main className="flex h-screen items-center justify-center">
      <h1 className="text-2xl font-bold">404</h1>
    </main>
  );
}
