import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { resendVerificationSchema } from '@roundtable/shared/schemas';

import { RoundTableLogo } from '../../components/RoundTableLogo';
import { ApiClientError } from '../../lib/api';
import { setToken } from '../../lib/auth';
import { disconnectSocket } from '../../lib/socket';
import { resendVerification, verifyEmail } from './api';

type Status = 'verifying' | 'success' | 'error';

/**
 * Reached only by clicking the emailed link — there's no "unverified but
 * logged in" state to show a banner in, so this page's error branch is the
 * other place (besides the login form) an unverified user can ask for a new
 * link, since a stale/reused link means they still can't log in normally.
 */
export function VerifyEmailPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get('token');

  const [status, setStatus] = useState<Status>('verifying');
  const [errorMessage, setErrorMessage] = useState('This verification link is invalid.');
  const [resendEmail, setResendEmail] = useState('');
  const [resendState, setResendState] = useState<'idle' | 'sending' | 'sent'>('idle');

  // Guards against StrictMode's dev-only double-invocation of this effect.
  // A ref (not reset by the effect's cleanup) survives across the
  // double-invoke, so the second pass can skip re-firing for the same
  // token — the verify endpoint is single-use, so a second real request
  // would come back ALREADY_VERIFIED even though the first one just
  // succeeded. There's deliberately no `cancelled`-style guard around the
  // request's own .then/.catch: StrictMode's synchronous cleanup would flip
  // that flag before the *surviving* (first) request resolves, discarding
  // its own success. React 18 already makes setState-after-unmount a safe
  // no-op, so nothing else needs guarding here.
  const requestedTokenRef = useRef<string | null>(null);

  useEffect(() => {
    if (!token) {
      setStatus('error');
      setErrorMessage('This verification link is missing its token.');
      return;
    }

    if (requestedTokenRef.current === token) {
      return;
    }
    requestedTokenRef.current = token;

    verifyEmail(token)
      .then(({ token: sessionToken }) => {
        setToken(sessionToken);
        // Same reasoning as LoginForm: drop any socket left over from a
        // previous identity before routing into the app.
        disconnectSocket();
        setStatus('success');
        navigate('/dashboard', { replace: true });
      })
      .catch((err: unknown) => {
        setStatus('error');
        setErrorMessage(
          err instanceof ApiClientError ? err.message : 'Something went wrong — please try again.',
        );
      });
  }, [token, navigate]);

  async function onResend(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = resendVerificationSchema.safeParse({ email: resendEmail });
    if (!parsed.success) return;

    setResendState('sending');
    try {
      await resendVerification(parsed.data);
      setResendState('sent');
    } catch {
      // Deliberately the same outcome as success — see the endpoint's own
      // comment on why this never distinguishes failure reasons to the caller.
      setResendState('sent');
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-rt-surface-sunken px-4">
      <div className="w-full max-w-sm rounded-xl border border-rt-tertiary bg-rt-surface p-8 text-center shadow-sm">
        <div className="mb-6 flex justify-center">
          <RoundTableLogo className="h-10 w-auto" />
        </div>

        {status === 'verifying' ? (
          <p className="text-sm text-rt-ink-muted">Verifying your email…</p>
        ) : null}

        {status === 'success' ? (
          <p className="text-sm text-rt-primary-deep">Verified! Taking you in…</p>
        ) : null}

        {status === 'error' ? (
          <div className="flex flex-col gap-4 text-left">
            <p role="alert" className="text-center text-sm text-red-600">
              {errorMessage}
            </p>

            {resendState === 'sent' ? (
              <p className="text-center text-sm text-rt-primary-deep">
                Check your email for a new link.
              </p>
            ) : (
              <form onSubmit={onResend} className="flex flex-col gap-2" noValidate>
                <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-rt-ink-muted">
                  Resend to
                  <input
                    type="email"
                    className="w-full rounded-full border border-rt-tertiary bg-rt-surface px-4 py-2 text-sm text-rt-ink placeholder:text-rt-ink-faint focus-visible:ring-2 focus-visible:ring-rt-secondary focus-visible:outline-none"
                    placeholder="you@team.com"
                    value={resendEmail}
                    onChange={(e) => setResendEmail(e.target.value)}
                    required
                  />
                </label>
                <button
                  type="submit"
                  disabled={resendState === 'sending'}
                  className="rounded-full bg-rt-secondary px-4 py-2 text-sm font-semibold text-rt-ink transition-colors hover:bg-rt-secondary-deep hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {resendState === 'sending' ? 'Sending…' : 'Resend verification email'}
                </button>
              </form>
            )}

            <Link
              to="/login"
              className="text-center text-sm font-semibold text-rt-primary-deep hover:underline"
            >
              Back to log in
            </Link>
          </div>
        ) : null}
      </div>
    </main>
  );
}
