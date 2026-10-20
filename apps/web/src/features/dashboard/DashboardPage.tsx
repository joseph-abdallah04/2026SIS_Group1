import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Check, Plus, Search } from 'lucide-react';
import type { SessionSummary } from '@roundtable/shared';

import { JoinByCodeForm } from '../sessions/JoinByCodeForm';
import { liveMembershipOf, useSessions } from '../sessions/useSessions';
import { AppHeader, useMe } from './AppHeader';
import type { DashboardState } from './dashboardState';
import { greetingFor } from './greeting';
import { DraftCard, PastSessionRow } from './SessionItems';

type Filter = 'all' | 'led';

const EYEBROW = 'text-[11px] font-semibold tracking-[0.12em] uppercase';

function matchesTitle(session: SessionSummary, query: string): boolean {
  const needle = query.trim().toLowerCase();
  return !needle || session.title.toLowerCase().includes(needle);
}

/** Past sessions in runs by the month they were created, newest first, as they arrive. */
function byMonth(sessions: SessionSummary[]): { label: string; sessions: SessionSummary[] }[] {
  const groups: { label: string; sessions: SessionSummary[] }[] = [];
  for (const session of sessions) {
    const label = new Date(session.createdAt).toLocaleDateString(undefined, {
      month: 'long',
      year: 'numeric',
    });
    const last = groups.at(-1);
    if (last?.label === label) last.sessions.push(session);
    else groups.push({ label, sessions: [session] });
  }
  return groups;
}

function SectionHeading({ title, count, hint }: { title: string; count: number; hint: string }) {
  return (
    <div className="mb-3 flex items-baseline justify-between gap-4">
      <h3 className={`${EYEBROW} text-rt-ink-muted`}>
        {title} <span className="ml-1 text-rt-ink-faint">{count}</span>
      </h3>
      <p className="hidden text-[12.5px] text-rt-ink-faint sm:block">{hint}</p>
    </div>
  );
}

/** Shown while the list loads: the shape of what is coming, so nothing jumps. */
function LoadingSessions() {
  return (
    <div
      aria-busy="true"
      aria-label="Loading sessions"
      className="flex animate-pulse flex-col gap-8"
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[0, 1, 2].map((key) => (
          <div key={key} className="h-36 rounded-2xl bg-rt-surface-alt" />
        ))}
      </div>
      <div className="flex flex-col gap-2 rounded-2xl border border-rt-tertiary/60 p-4">
        {[0, 1, 2].map((key) => (
          <div key={key} className="h-10 rounded-xl bg-rt-surface-alt" />
        ))}
      </div>
    </div>
  );
}

/** A first visit: nothing to list yet, so say what will be here and how to start. */
function FirstVisit() {
  return (
    <div className="flex flex-col items-center rounded-3xl border border-dashed border-rt-tertiary px-6 py-12 text-center">
      <div aria-hidden className="relative h-14 w-24">
        <span className="absolute top-1 left-1 size-10 -rotate-6 bg-[#FDF4E5] shadow-sm" />
        <span className="absolute top-0 left-8 size-10 rotate-3 bg-[#F9EEF2] shadow-sm" />
        <span className="absolute top-3 left-14 size-10 -rotate-2 bg-[#EEF2F4] shadow-sm" />
      </div>
      <h3 className="mt-4 text-[16px] font-semibold text-rt-ink">No sessions yet</h3>
      <p className="mt-1.5 max-w-sm text-[13px] text-rt-ink-muted">
        Sessions you set up and take part in will show up here. Join one with a code, or create your
        first.
      </p>
    </div>
  );
}

/**
 * F07, with the one-live-session-at-a-time rule (KAN-33 decisions): being in
 * a lobby/active session means you are *in* it, so anyone with a live
 * membership — leader or member — is redirected straight back into it rather
 * than being allowed to browse from here. Leaving is an action on the
 * waiting room / pinboard, not a dashboard button; once they leave, this
 * page is reachable again and they can join another or start their own.
 *
 * That is why only drafts and ended sessions render below: a live session is
 * never visible from this page, because reaching this page at all means there
 * isn't one.
 *
 * The two ways in, joining with a code and leading a session, sit side by side
 * at the top with the same weight: many people only ever join. Below, drafts
 * are cards of work to pick back up, and ended sessions a history to browse,
 * by month, each with the first thing it decided.
 */
export function DashboardPage() {
  const { sessions, loading, error, reload } = useSessions();
  const navigate = useNavigate();
  const location = useLocation();
  const user = useMe();

  // A draft just saved, handed over by the page that saved it: pointed out
  // for a few seconds, with a word that it worked. Taken off the history
  // entry straight away, so a refresh or coming Back does not say it again.
  const [savedDraftId, setSavedDraftId] = useState(
    () => (location.state as DashboardState | null)?.savedDraftId ?? null,
  );
  useEffect(() => {
    if (!(location.state as DashboardState | null)?.savedDraftId) return;
    navigate(location.pathname, { replace: true, state: null });
  }, [location.state, location.pathname, navigate]);
  useEffect(() => {
    if (!savedDraftId) return;
    const timer = window.setTimeout(() => setSavedDraftId(null), 3500);
    return () => window.clearTimeout(timer);
  }, [savedDraftId]);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');

  // `isCurrentMember` matters: a session they left still appears here as
  // history, and without that check the redirect would haul them straight
  // back into the session they just walked out of.
  const liveSession = liveMembershipOf(sessions);

  useEffect(() => {
    if (liveSession) navigate(`/sessions/${liveSession.id}`, { replace: true });
  }, [liveSession, navigate]);

  const visible = useMemo(
    () =>
      (sessions ?? []).filter(
        (session) => matchesTitle(session, query) && (filter === 'all' || session.isLeader),
      ),
    [sessions, query, filter],
  );
  const drafts = visible.filter((session) => session.status === 'draft');
  const past = visible.filter((session) => session.status === 'ended');
  const listed = (sessions ?? []).filter((s) => s.status === 'draft' || s.status === 'ended');
  const narrowed = query.trim().length > 0 || filter === 'led';

  // The display line (see `greetingFor`). Chosen once a visit, once both the
  // name and the list are in, so it never changes under somebody's eyes, not
  // even when a session is deleted from the list below.
  const [greeting, setGreeting] = useState<string | null>(null);
  const firstName = user?.displayName.trim().split(/\s+/)[0];
  useEffect(() => {
    if (greeting || !user || !firstName || !sessions) return;
    setGreeting(
      greetingFor({
        firstName,
        sessionDates: listed.map((session) => session.createdAt),
        accountCreatedAt: user.createdAt,
      }),
    );
  }, [greeting, user, firstName, sessions, listed]);

  return (
    <main className="flex min-h-screen flex-col bg-rt-surface text-rt-ink">
      {/* Its heading is the page's: the cards below say what can be done here. */}
      <AppHeader page="Dashboard" user={user} />

      <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col px-4 py-8 sm:px-6 sm:py-10">
        {/* The page's one display line. Its height is kept while the name
            loads, so the cards below never jump down when it arrives. */}
        <p className="mb-6 min-h-[1.2em] font-serif text-[32px] leading-tight font-normal tracking-[-0.02em] text-rt-ink sm:text-[40px]">
          {greeting}
        </p>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <JoinByCodeForm />
          <section
            aria-labelledby="lead-session-title"
            className="flex flex-col rounded-3xl border border-rt-tertiary/70 bg-rt-surface p-6 sm:p-7"
          >
            <p className={`${EYEBROW} text-rt-ink-muted`}>Lead a session</p>
            <h2
              id="lead-session-title"
              className="mt-2 text-[20px] font-semibold tracking-[-0.01em]"
            >
              Run a decision meeting.
            </h2>
            {/* No word left alone on the last line: wrapped with care where the
                browser can, and "on record" kept together where it cannot. */}
            <p className="mt-1.5 text-[13px] text-pretty text-rt-ink-muted">
              Set the agenda, bring your team in, and leave with answers on&nbsp;record.
            </p>
            <div className="mt-auto pt-5">
              <Link
                to="/sessions/new"
                className="inline-flex min-h-12 items-center gap-2 rounded-full bg-rt-secondary px-5 text-[14px] font-semibold text-rt-ink transition-colors hover:bg-rt-secondary-deep hover:text-white focus-visible:ring-2 focus-visible:ring-rt-secondary focus-visible:ring-offset-2 focus-visible:outline-none"
              >
                <Plus aria-hidden size={16} strokeWidth={2.4} />
                Create session
              </Link>
            </div>
          </section>
        </div>

        <section aria-labelledby="your-sessions" className="mt-12 flex flex-col">
          <div className="mb-6 flex flex-wrap items-center gap-3">
            <h2 id="your-sessions" className="mr-auto text-[19px] font-semibold tracking-[-0.01em]">
              Your sessions
            </h2>
            {listed.length > 0 ? (
              <>
                <div
                  role="group"
                  aria-label="Show"
                  className="flex rounded-full border border-rt-tertiary/80 bg-rt-surface-alt p-0.5"
                >
                  {(
                    [
                      ['all', 'All'],
                      ['led', 'Led by me'],
                    ] as const
                  ).map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      aria-pressed={filter === value}
                      onClick={() => setFilter(value)}
                      className={`min-h-8 cursor-pointer rounded-full px-3.5 text-[12.5px] font-semibold transition-colors focus-visible:ring-2 focus-visible:ring-rt-secondary focus-visible:outline-none ${
                        filter === value
                          ? 'bg-white text-rt-ink shadow-sm'
                          : 'text-rt-ink-muted hover:text-rt-ink'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <label className="flex min-h-9 w-full items-center gap-2 rounded-full border border-rt-tertiary bg-rt-surface px-3.5 focus-within:border-rt-secondary focus-within:ring-2 focus-within:ring-rt-secondary/30 sm:w-64">
                  <Search aria-hidden size={15} className="shrink-0 text-rt-ink-faint" />
                  <span className="sr-only">Search sessions by title</span>
                  <input
                    autoComplete="off"
                    type="search"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Search by title"
                    className="min-w-0 flex-1 bg-transparent py-1.5 text-[13px] text-rt-ink outline-none placeholder:text-rt-ink-faint"
                  />
                </label>
              </>
            ) : null}
          </div>

          {loading ? <LoadingSessions /> : null}

          {liveSession ? (
            <p className="text-[13px] text-rt-ink-muted">Taking you back to your live session…</p>
          ) : null}

          {error ? (
            <div
              role="alert"
              className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-[13px]"
            >
              <p className="text-red-700">{error}</p>
              <button
                type="button"
                onClick={() => void reload()}
                className="cursor-pointer rounded-full bg-white px-3.5 py-1.5 font-semibold text-rt-ink ring-1 ring-red-200 hover:bg-red-100"
              >
                Try again
              </button>
            </div>
          ) : null}

          {sessions && !liveSession && listed.length === 0 ? <FirstVisit /> : null}

          {sessions && !liveSession && listed.length > 0 && visible.length === 0 && narrowed ? (
            <div className="flex flex-col items-center rounded-2xl border border-dashed border-rt-tertiary px-6 py-10 text-center">
              <p className="text-[14px] font-semibold text-rt-ink">
                {query.trim()
                  ? `No sessions match “${query.trim()}”`
                  : 'You have not led a session yet'}
              </p>
              <button
                type="button"
                onClick={() => {
                  setQuery('');
                  setFilter('all');
                }}
                className="mt-3 cursor-pointer rounded-full border border-rt-tertiary px-3.5 py-1.5 text-[12.5px] font-semibold text-rt-ink hover:bg-rt-surface-alt"
              >
                Show all sessions
              </button>
            </div>
          ) : null}

          {sessions && !liveSession ? (
            <div className="flex flex-col gap-10">
              {drafts.length > 0 ? (
                <div>
                  <SectionHeading
                    title="Drafts"
                    count={drafts.length}
                    hint="Pick up where you left off"
                  />
                  <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {drafts.map((session) => (
                      <DraftCard
                        key={session.id}
                        session={session}
                        onChanged={reload}
                        fresh={session.id === savedDraftId}
                      />
                    ))}
                  </ul>
                </div>
              ) : null}

              {past.length > 0 ? (
                <div>
                  <SectionHeading
                    title="Past sessions"
                    count={past.length}
                    hint="Open any one to see its board and recap"
                  />
                  <div className="rounded-2xl border border-rt-tertiary/70 px-2 py-2 sm:px-3">
                    {byMonth(past).map((group) => (
                      <section key={group.label} aria-label={group.label} className="py-1">
                        <h4 className="px-3 pt-2 pb-1 text-[12px] font-medium text-rt-ink-faint sm:px-4">
                          {group.label}
                        </h4>
                        <ul>
                          {group.sessions.map((session) => (
                            <PastSessionRow key={session.id} session={session} onChanged={reload} />
                          ))}
                        </ul>
                      </section>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}
        </section>
      </div>

      {/* Said where it will be heard, and gone again with the highlight. */}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-6 flex justify-center px-4"
      >
        {savedDraftId ? (
          <p className="flex animate-[rt-toast-in_220ms_ease-out] items-center motion-reduce:animate-none gap-2 rounded-full bg-rt-ink px-4 py-2.5 text-[13px] font-semibold text-white shadow-lg">
            <Check aria-hidden size={15} strokeWidth={2.6} className="text-rt-primary" />
            Draft saved
          </p>
        ) : null}
      </div>
    </main>
  );
}
