import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { forgotPasswordSchema } from '@roundtable/shared/schemas';

import { RoundTableLogo } from '../../components/RoundTableLogo';
import { forgotPassword } from './api';

const INPUT_CLASSES =
  'w-full rounded-full border border-rt-tertiary bg-rt-surface px-5 py-3 text-sm text-rt-ink placeholder:text-rt-ink-faint focus-visible:ring-2 focus-visible:ring-rt-secondary focus-visible:outline-none';

const LABEL_CLASSES =
  'flex flex-col gap-2 text-xs font-semibold uppercase tracking-wide text-rt-ink-muted';

/**
 * Reached from the login page's "Forgot password?" link. The confirmation
 * below shows unconditionally on submit — never "no account with that
 * email" — because the backend's own response is identical either way (see
 * `forgotPassword`'s comment); showing anything else here would just move
 * the same enumeration leak from the network response into the UI.
 */
export function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const parsed = forgotPasswordSchema.safeParse({ email });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Please enter a valid email');
      return;
    }

    setError(null);
    setSubmitting(true);
    try {
      await forgotPassword(parsed.data);
    } catch {
      // Deliberately ignored — see the file comment. A rate-limit or
      // transient failure still lands on the same confirmation screen.
    } finally {
      setSubmitting(false);
      setSubmitted(true);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-rt-surface-sunken px-4">
      <div className="w-full max-w-sm rounded-xl border border-rt-tertiary bg-rt-surface p-8 shadow-sm">
        <div className="mb-6 flex justify-center">
          <RoundTableLogo className="h-10 w-auto" />
        </div>

        {submitted ? (
          <div className="flex flex-col gap-3 text-center">
            <h2 className="text-lg font-semibold text-rt-ink">Check your email</h2>
            <p className="text-sm text-rt-ink-muted">
              If an account exists for <span className="font-semibold text-rt-ink">{email}</span>,
              we sent a link to reset the password.
            </p>
            <Link
              to="/login"
              className="mt-2 text-center text-sm font-semibold text-rt-primary-deep hover:underline"
            >
              Back to log in
            </Link>
          </div>
        ) : (
          <form className="flex flex-col gap-4" onSubmit={onSubmit} noValidate>
            <h2 className="text-lg font-semibold text-rt-ink">Reset your password</h2>
            <p className="text-sm text-rt-ink-muted">
              Enter your email and we&apos;ll send you a link to set a new password.
            </p>

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

            {error ? (
              <p role="alert" className="text-sm text-red-600">
                {error}
              </p>
            ) : null}

            <button
              type="submit"
              disabled={submitting}
              className="mt-2 w-full rounded-full bg-rt-secondary px-4 py-3 text-sm font-semibold text-rt-ink transition-colors hover:bg-rt-secondary-deep hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting ? 'Sending…' : 'Send reset link'}
            </button>

            <Link
              to="/login"
              className="text-center text-sm font-semibold text-rt-primary-deep hover:underline"
            >
              Back to log in
            </Link>
          </form>
        )}
      </div>
    </main>
  );
}
