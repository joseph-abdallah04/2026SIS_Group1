import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { liveMembershipOf, useSessions } from '../sessions/useSessions';
import { LlmSettingsForm } from './LlmSettingsForm';
import { ProfilePage } from './ProfilePage';

const ACTIVE_TAB_CLASSES =
  'rounded-full bg-rt-secondary-tint px-4 py-2 text-sm font-semibold text-rt-ink';
const INACTIVE_TAB_CLASSES =
  'rounded-full px-4 py-2 text-sm font-medium text-rt-ink-muted transition-colors hover:bg-rt-primary-tint hover:text-rt-ink';

// The "AI assistant" tab was an inert placeholder and got removed on main as not-yet-built.
// F33 landed on this branch, so it is a real tab again — the same shell, now with something
// behind it. ("Audio" stayed removed; nothing owns it yet.)
const TABS = [
  { id: 'profile', label: 'Profile' },
  { id: 'assistant', label: 'AI assistant' },
] as const;

type TabId = (typeof TABS)[number]['id'];

export function SettingsPage() {
  const [tab, setTab] = useState<TabId>('profile');
  const { sessions, loading } = useSessions();
  const navigate = useNavigate();
  const liveSession = liveMembershipOf(sessions);

  useEffect(() => {
    if (liveSession) navigate(`/sessions/${liveSession.id}`, { replace: true });
  }, [liveSession, navigate]);

  // Do not paint Profile (and its delete-account control) until we know this
  // person is not in a lobby or live session.
  if (loading || liveSession) {
    return (
      <main className="min-h-screen bg-rt-secondary-wash px-6 py-10 md:px-16">
        <p className="text-sm text-rt-ink-muted">
          {liveSession ? 'Taking you back to your live session…' : 'Loading…'}
        </p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-rt-secondary-wash px-6 py-10 md:px-16">
      <div className="mx-auto max-w-2xl">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="font-serif text-3xl font-bold text-rt-ink">Settings</h1>
          <Link
            to="/dashboard"
            className="text-sm font-semibold text-rt-primary-deep hover:underline"
          >
            Back to dashboard
          </Link>
        </div>

        <div
          role="tablist"
          aria-label="Settings sections"
          className="mb-8 flex items-center gap-2 border-b border-rt-tertiary pb-4"
        >
          {TABS.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              role="tab"
              id={`settings-tab-${id}`}
              aria-selected={tab === id}
              aria-controls={`settings-panel-${id}`}
              onClick={() => setTab(id)}
              className={tab === id ? ACTIVE_TAB_CLASSES : INACTIVE_TAB_CLASSES}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Both panels stay mounted so switching tabs does not throw away a half-typed API
            key or an unsaved profile edit. */}
        <div
          role="tabpanel"
          id="settings-panel-profile"
          aria-labelledby="settings-tab-profile"
          hidden={tab !== 'profile'}
        >
          <ProfilePage />
        </div>
        <div
          role="tabpanel"
          id="settings-panel-assistant"
          aria-labelledby="settings-tab-assistant"
          hidden={tab !== 'assistant'}
        >
          <LlmSettingsForm />
        </div>
      </div>
    </main>
  );
}
