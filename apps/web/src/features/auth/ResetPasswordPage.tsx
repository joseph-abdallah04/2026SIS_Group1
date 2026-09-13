import { useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { resetPasswordSchema } from '@roundtable/shared/schemas';

import { RoundTableLogo } from '../../components/RoundTableLogo';
import { ApiClientError } from '../../lib/api';
import { resetPassword } from './api';

const INPUT_CLASSES =
  'w-full rounded-full border border-rt-tertiary bg-rt-surface px-5 py-3 text-sm text-rt-ink placeholder:text-rt-ink-faint focus-visible:ring-2 focus-visible:ring-rt-secondary focus-visible:outline-none';

const LABEL_CLASSES =
  'flex flex-col gap-2 text-xs font-semibold uppercase tracking-wide text-rt-ink-muted';

/**
 * Reached only by clicking the emailed reset link. Unlike VerifyEmailPage,
 * there is no eager on-mount call here — the token is only ever spent by
 * actually submitting a new password, so a missing token is caught up front
 * but an expired/already-used one only surfaces once the form is submitted
 * (the server is the only thing that can tell those apart).
 */
export function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) return;

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    const parsed = resetPasswordSchema.safeParse({ token, password });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Please check your details and try again');
      return;
    }

    setError(null);
    setSubmitting(true);
    try {
      await resetPassword(parsed.data);
      setDone(true);
    } catch (err) {
      setError(
        err instanceof ApiClientError ? err.message : 'Something went wrong — please try again',
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-rt-surface-sunken px-4">
      <div className="w-full max-w-sm rounded-xl border border-rt-tertiary bg-rt-surface p-8 shadow-sm">
        <div className="mb-6 flex justify-center">
          <RoundTableLogo className="h-10 w-auto" />
        </div>

        {!token ? (
          <div className="flex flex-col gap-4 text-center">
            <p role="alert" className="text-sm text-red-600">
              This password reset link is missing its token.
            </p>
            <Link
              to="/forgot-password"
              className="text-center text-sm font-semibold text-rt-primary-deep hover:underline"
            >
              Request a new link
            </Link>
          </div>
        ) : done ? (
          <div className="flex flex-col gap-3 text-center">
            <h2 className="text-lg font-semibold text-rt-ink">Password updated</h2>
            <p className="text-sm text-rt-ink-muted">
              Your password has been changed. Log in with your new password.
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
            <h2 className="text-lg font-semibold text-rt-ink">Set a new password</h2>

            <label className={LABEL_CLASSES}>
              New password
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
              Confirm new password
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
              <div className="flex flex-col gap-2">
                <p role="alert" className="text-sm text-red-600">
                  {error}
                </p>
                <Link
                  to="/forgot-password"
                  className="text-sm font-semibold text-rt-primary-deep hover:underline"
                >
                  Request a new link
                </Link>
              </div>
            ) : null}

            <button
              type="submit"
              disabled={submitting}
              className="mt-2 w-full rounded-full bg-rt-secondary px-4 py-3 text-sm font-semibold text-rt-ink transition-colors hover:bg-rt-secondary-deep hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting ? 'Updating…' : 'Update password'}
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
