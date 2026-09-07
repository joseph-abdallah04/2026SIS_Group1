import { Link } from 'react-router-dom';

import { ProfilePage } from './ProfilePage';

const ACTIVE_TAB_CLASSES = 'rounded-full bg-rt-secondary-tint px-4 py-2 text-sm font-semibold text-rt-ink';
const DISABLED_TAB_CLASSES =
  'px-4 py-2 text-sm font-medium text-rt-ink-faint cursor-default';

/**
 * "AI assistant" (F33) and "Audio" aren't built yet — shown as inert tabs so
 * the shell reads as finished/expected rather than missing, per the mockup.
 * They become real routes/tabs when those tickets land.
 */
function ComingSoonTab({ label }: { label: string }) {
  return (
    <button type="button" disabled className={DISABLED_TAB_CLASSES} title="Coming soon">
      {label}
    </button>
  );
}

export function SettingsPage() {
  return (
    <main className="min-h-screen bg-rt-secondary-wash px-6 py-10 md:px-16">
      <div className="mx-auto max-w-2xl">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="font-serif text-3xl font-bold text-rt-ink">Settings</h1>
          <Link to="/dashboard" className="text-sm font-semibold text-rt-primary-deep hover:underline">
            Back to dashboard
          </Link>
        </div>

        <div className="mb-8 flex items-center gap-2 border-b border-rt-tertiary pb-4">
          <ComingSoonTab label="AI assistant" />
          <span className={ACTIVE_TAB_CLASSES}>Profile</span>
          <ComingSoonTab label="Audio" />
        </div>

        <ProfilePage />
      </div>
    </main>
  );
}
