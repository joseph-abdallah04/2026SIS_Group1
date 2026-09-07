import { useState, type ButtonHTMLAttributes, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { loginSchema, signupSchema } from '@roundtable/shared/schemas';

import { RoundTableLogo } from '../../components/RoundTableLogo';
import { ApiClientError } from '../../lib/api';
import { setToken, safeReturnPath } from '../../lib/auth';
import { disconnectSocket } from '../../lib/socket';
import { login, resendVerification, signup } from './api';

const INPUT_CLASSES =
  'w-full rounded-full border border-rt-tertiary bg-rt-surface px-5 py-3 text-sm text-rt-ink placeholder:text-rt-ink-faint focus-visible:ring-2 focus-visible:ring-rt-secondary focus-visible:outline-none';

const LABEL_CLASSES =
  'flex flex-col gap-2 text-xs font-semibold uppercase tracking-wide text-rt-ink-muted';

/**
 * Pill-shaped CTA for this page only — the shared `Button` component hardcodes
 * `rounded-lg` for every other button in the app, and a `className` override
 * can't reliably win that fight (Tailwind resolves conflicting utilities like
 * `rounded-lg`/`rounded-full` by generation order, not DOM order). Uses the
 * mustard `rt-secondary` token as the CTA — same gold as the rest of the app.
 */
function SubmitButton({ children, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="submit"
      className="mt-2 w-full rounded-full bg-rt-secondary px-4 py-3 text-sm font-semibold text-rt-ink transition-colors hover:bg-rt-secondary-deep hover:text-white focus-visible:ring-2 focus-visible:ring-rt-secondary focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
      {...props}
    >
      {children}
    </button>
  );
}

function TabBar({ activeTab, nextQuery }: { activeTab: 'login' | 'signup'; nextQuery: string }) {
  const tabClasses = (tab: 'login' | 'signup') =>
    `pb-3 text-sm font-semibold border-b-2 transition-colors ${
      activeTab === tab
        ? 'border-rt-secondary text-rt-ink'
        : 'border-transparent text-rt-ink-faint hover:text-rt-ink-muted'
    }`;

  return (
    <div className="mb-6 flex gap-6 border-b border-rt-tertiary">
      <Link to={`/login${nextQuery}`} className={tabClasses('login')}>
        Log in
      </Link>
      <Link to={`/signup${nextQuery}`} className={tabClasses('signup')}>
        Sign up
      </Link>
    </div>
  );
}

function LoginForm() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // Set only on a 403 EMAIL_NOT_VERIFIED — an unverified account has no
  // working session, so this is the only place a blocked user can ask for
  // the link again (the ticket's "banner", relocated: there's no in-app
  // state to show it in anymore).
  const [unverifiedEmail, setUnverifiedEmail] = useState<string | null>(null);
  const [resendState, setResendState] = useState<'idle' | 'sending' | 'sent'>('idle');

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const parsed = loginSchema.safeParse({ email, password });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Please check your details and try again');
      return;
    }

    setError(null);
    setUnverifiedEmail(null);
    setResendState('idle');
    setSubmitting(true);
    try {
      const { token } = await login(parsed.data);
      setToken(token);
      // Handshake identity is read once when the socket is created — drop any
      // socket from a previous account before routing into the app.
      disconnectSocket();
      navigate(safeReturnPath(searchParams.get('next')), { replace: true });
    } catch (err) {
      if (err instanceof ApiClientError && err.code === 'EMAIL_NOT_VERIFIED') {
        setError(err.message);
        setUnverifiedEmail(parsed.data.email);
      } else {
        setError(
          err instanceof ApiClientError ? err.message : 'Something went wrong — please try again',
        );
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function onResend() {
    if (!unverifiedEmail) return;
    setResendState('sending');
    try {
      await resendVerification({ email: unverifiedEmail });
      setResendState('sent');
    } catch {
      // Same generic wording either way — this endpoint never distinguishes
      // "already sent", "unknown email", or a transient failure to the
      // caller, so neither does this button.
      setResendState('sent');
    }
  }

  return (
    <form className="flex flex-col gap-4" onSubmit={onSubmit} noValidate>
      <label className={LABEL_CLASSES}>
        Email
        <input
          className={INPUT_CLASSES}
          type="email"
          autoComplete="email"
          placeholder="you@team.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
      </label>

      <label className={LABEL_CLASSES}>
        Password
        <input
          className={INPUT_CLASSES}
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
      </label>

      {error ? (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      ) : null}

      {unverifiedEmail ? (
        resendState === 'sent' ? (
          <p className="text-sm text-rt-primary-deep">Check your email for a new link.</p>
        ) : (
          <button
            type="button"
            onClick={() => void onResend()}
            disabled={resendState === 'sending'}
            className="self-start text-sm font-semibold text-rt-primary-deep hover:underline disabled:cursor-not-allowed disabled:opacity-50"
          >
            {resendState === 'sending' ? 'Sending…' : 'Resend verification email'}
          </button>
        )
      ) : null}

      <SubmitButton disabled={submitting}>{submitting ? 'Logging in…' : 'Log in'}</SubmitButton>
    </form>
  );
}

function SignupForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // No token comes back from signup — this is a confirmation screen, not a
  // pre-navigation flag. The account has no working session until the
  // emailed link is clicked.
  const [submitted, setSubmitted] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    const parsed = signupSchema.safeParse({ email, password, displayName });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Please check your details and try again');
      return;
    }

    setError(null);
    setSubmitting(true);
    try {
      await signup(parsed.data);
      setSubmitted(true);
    } catch (err) {
      setError(
        err instanceof ApiClientError ? err.message : 'Something went wrong — please try again',
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (submitted) {
    return (
      <div className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold text-rt-ink">Check your email</h2>
        <p className="text-sm text-rt-ink-muted">
          We sent a verification link to <span className="font-semibold text-rt-ink">{email}</span>.
          Click it to finish setting up your account — you won&apos;t be able to log in until you
          do.
        </p>
      </div>
    );
  }

  return (
    <form className="flex flex-col gap-4" onSubmit={onSubmit} noValidate>
      <label className={LABEL_CLASSES}>
        Display name
        <input
          className={INPUT_CLASSES}
          type="text"
          autoComplete="name"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          maxLength={50}
          required
        />
      </label>

      <label className={LABEL_CLASSES}>
        Email
        <input
          className={INPUT_CLASSES}
          type="email"
          autoComplete="email"
          placeholder="you@team.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
      </label>

      <label className={LABEL_CLASSES}>
        Password
        <input
          className={INPUT_CLASSES}
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          minLength={8}
          required
        />
      </label>

      <label className={LABEL_CLASSES}>
        Confirm password
        <input
          className={INPUT_CLASSES}
          type="password"
          autoComplete="new-password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          minLength={8}
          required
        />
      </label>

      {error ? (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      ) : null}

      <SubmitButton disabled={submitting}>
        {submitting ? 'Creating account…' : 'Sign up'}
      </SubmitButton>
    </form>
  );
}

export interface AuthPageProps {
  activeTab: 'login' | 'signup';
}

export function AuthPage({ activeTab }: AuthPageProps) {
  const [searchParams] = useSearchParams();
  const next = searchParams.get('next');
  const nextQuery = next ? `?next=${encodeURIComponent(next)}` : '';

  return (
    <main className="grid min-h-screen md:grid-cols-2">
      <div className="flex flex-col justify-start gap-4 bg-rt-secondary-wash px-10 py-10 md:px-16 lg:px-24">
        <div className="mb-2 flex items-center gap-3">
          <RoundTableLogo className="h-12 w-auto" />
          <span className="text-xl font-bold text-rt-ink">RoundTable</span>
        </div>
        <h1 className="max-w-md font-serif text-3xl font-bold text-rt-ink lg:text-4xl">
          Sessions that end in a decision, not a doc.
        </h1>
        <p className="max-w-sm font-serif text-sm text-rt-secondary-deep">
          Bring the team onto one board, vote once, and walk away with the answers written down.
        </p>
      </div>

      <div className="flex flex-col justify-center bg-rt-surface px-10 py-10 md:px-16 lg:px-24">
        <div className="w-full max-w-sm">
          <TabBar activeTab={activeTab} nextQuery={nextQuery} />
          {activeTab === 'login' ? <LoginForm /> : <SignupForm />}
        </div>
      </div>
    </main>
  );
}
