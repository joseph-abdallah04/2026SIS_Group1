import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Sparkles, UserRound, type LucideIcon } from 'lucide-react';

import { AppHeader, useMe } from '../dashboard/AppHeader';
import { liveMembershipOf, useSessions } from '../sessions/useSessions';
import { LlmSettingsForm } from './LlmSettingsForm';
import { ProfilePage } from './ProfilePage';

// The "AI assistant" tab was an inert placeholder and got removed on main as not-yet-built.
// F33 landed on this branch, so it is a real tab again — the same shell, now with something
// behind it. ("Audio" stayed removed; nothing owns it yet.)
const TABS: readonly { id: 'profile' | 'assistant'; label: string; Icon: LucideIcon }[] = [
  { id: 'profile', label: 'Profile', Icon: UserRound },
  { id: 'assistant', label: 'AI assistant', Icon: Sparkles },
];

type TabId = (typeof TABS)[number]['id'];

/** Whether the assistant is set up, beside its tab, once the form has said. */
function AssistantState({ on }: { on: boolean }) {
  return (
    <span
      className={`ml-auto flex items-center gap-1.5 text-[12px] font-medium ${
        on ? 'text-emerald-700' : 'text-rt-ink-faint'
      }`}
    >
      <span
        aria-hidden
        className={`size-1.5 rounded-full ${on ? 'bg-emerald-500' : 'bg-rt-tertiary'}`}
      />
      {on ? 'On' : 'Off'}
    </span>
  );
}

export function SettingsPage() {
  const [tab, setTab] = useState<TabId>('profile');
  const [assistantOn, setAssistantOn] = useState<boolean | null>(null);
  const user = useMe();
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
      <main className="min-h-screen bg-rt-surface px-6 py-10 md:px-16">
        <p className="text-sm text-rt-ink-muted">
          {liveSession ? 'Taking you back to your live session…' : 'Loading…'}
        </p>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen flex-col bg-rt-surface text-rt-ink">
      <AppHeader page="Settings" user={user} />

      <div className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 sm:px-6 sm:py-10">
        <h1 className="text-[28px] font-semibold tracking-[-0.02em]">Settings</h1>

        <div className="mt-6 flex flex-col gap-6 md:flex-row md:gap-10">
          <aside className="flex shrink-0 flex-col gap-3 md:w-64">
            <Link
              to="/dashboard"
              className="flex items-center gap-2 self-start rounded-full px-2 py-1 text-[13.5px] font-medium text-rt-ink-muted hover:text-rt-ink"
            >
              <ArrowLeft aria-hidden size={15} />
              Back to dashboard
            </Link>

            <div
              role="tablist"
              aria-label="Settings sections"
              aria-orientation="vertical"
              className="flex gap-1.5 md:flex-col"
            >
              {TABS.map(({ id, label, Icon }) => {
                const selected = tab === id;
                return (
                  <button
                    key={id}
                    type="button"
                    role="tab"
                    id={`settings-tab-${id}`}
                    aria-selected={selected}
                    aria-controls={`settings-panel-${id}`}
                    onClick={() => setTab(id)}
                    className={`flex flex-1 cursor-pointer items-center gap-3 rounded-2xl border px-3 py-2.5 text-left text-[14px] whitespace-nowrap transition-colors focus-visible:ring-2 focus-visible:ring-rt-secondary focus-visible:outline-none md:flex-none ${
                      selected
                        ? 'border-rt-tertiary/80 bg-rt-surface font-semibold text-rt-ink shadow-[0_1px_2px_rgb(31_35_40/0.05)]'
                        : 'border-transparent font-medium text-rt-ink-muted hover:bg-rt-surface-alt hover:text-rt-ink'
                    }`}
                  >
                    <span
                      aria-hidden
                      // Left out on a phone, where the two sections sit side by side.
                      className={`hidden size-8 shrink-0 items-center justify-center rounded-lg sm:flex ${
                        selected
                          ? 'bg-rt-secondary-wash text-rt-secondary-deep'
                          : 'bg-rt-surface-alt'
                      }`}
                    >
                      <Icon size={16} />
                    </span>
                    {label}
                    {id === 'assistant' && assistantOn !== null ? (
                      <AssistantState on={assistantOn} />
                    ) : null}
                  </button>
                );
              })}
            </div>
          </aside>

          {/* Both panels stay mounted so switching tabs does not throw away a half-typed API
              key or an unsaved profile edit. */}
          <div className="min-w-0 flex-1">
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
              <LlmSettingsForm onConnectedChange={setAssistantOn} />
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
