import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Lock } from 'lucide-react';
import { updateProfileSchema } from '@roundtable/shared/schemas';

import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { PasswordInput } from '../../components/ui/PasswordInput';
import { ApiClientError } from '../../lib/api';
import { clearToken } from '../../lib/auth';
import { disconnectSocket } from '../../lib/socket';
import { deleteAccount, getMe, updateProfile } from '../auth/api';
import { initialsFromName, swatchForId } from '../sessions/waitingRoomSeats';
import {
  FIELD,
  FIELD_HINT,
  PRIMARY_BUTTON,
  SETTINGS_CARD,
  SETTINGS_CARD_TITLE,
  TEXT_INPUT,
} from './settingsStyles';

/**
 * Account deletion. Asked for in two steps: the button only opens the
 * question, and the question will not go ahead until the password is typed
 * into it, so nothing irreversible fires from a single stray press.
 *
 * On success this clears the token and drops the socket exactly like
 * logout (`AppHeader`'s `onLogout`) before navigating away — there is
 * no account left to have a session for.
 */
function DeleteAccountSection() {
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onConfirm() {
    setDeleting(true);
    setError(null);
    try {
      await deleteAccount({ password });
      clearToken();
      disconnectSocket();
      navigate('/login', { replace: true });
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Could not delete your account');
      setConfirming(false);
      setDeleting(false);
    }
  }

  return (
    <section
      aria-labelledby="delete-account-title"
      className={`${SETTINGS_CARD} flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between`}
    >
      <div className="max-w-xl">
        <h2 id="delete-account-title" className="text-[16px] font-semibold text-rt-ink">
          Delete account
        </h2>
        <p className="mt-1.5 text-[13.5px] leading-relaxed text-rt-ink-muted">
          Removes your account for good. Sessions you led and proposals you posted stay, credited to
          “Deleted user”.
        </p>
        {error ? (
          <p role="alert" className="mt-2 text-[13px] text-red-600">
            {error}
          </p>
        ) : null}
      </div>
      <button
        type="button"
        onClick={() => {
          setPassword('');
          setConfirming(true);
        }}
        className="inline-flex min-h-11 shrink-0 cursor-pointer items-center self-start rounded-full border border-red-200 bg-rt-surface px-5 text-[14px] font-semibold text-red-700 transition-colors hover:border-red-300 hover:bg-red-50 focus-visible:ring-2 focus-visible:ring-red-400 focus-visible:outline-none sm:self-center"
      >
        Delete account
      </button>

      {confirming ? (
        <ConfirmDialog
          title="Delete your account?"
          confirmLabel="Delete account"
          confirmingLabel="Deleting…"
          busy={deleting}
          confirmDisabled={password.length === 0}
          onConfirm={() => void onConfirm()}
          onCancel={() => setConfirming(false)}
        >
          <p>
            This permanently deletes your account and logs you out. Sessions you led and proposals
            you posted stay in place, credited to “Deleted user”. This cannot be undone.
          </p>
          <PasswordInput
            label="Type your password to confirm"
            className="mt-4 flex flex-col gap-2 text-[13px] font-semibold text-rt-ink"
            inputClassName={TEXT_INPUT}
            autoComplete="current-password"
            autoFocus
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </ConfirmDialog>
      ) : null}
    </section>
  );
}

/**
 * Content for the "Profile" section of /settings — no page chrome of its own,
 * that lives in SettingsPage (the shell around the sections).
 */
export function ProfilePage() {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [userId, setUserId] = useState('');
  const [email, setEmail] = useState('');
  // The last value confirmed by the server — the rollback target if a save fails.
  const [savedDisplayName, setSavedDisplayName] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [validationError, setValidationError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [justSaved, setJustSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getMe()
      .then(({ user }) => {
        if (cancelled) return;
        setUserId(user.id);
        setEmail(user.email);
        setDisplayName(user.displayName);
        setSavedDisplayName(user.displayName);
      })
      .catch((err) => {
        if (cancelled) return;
        setLoadError(err instanceof ApiClientError ? err.message : 'Could not load your profile');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    // A second submit while one is already in flight would race the first's
    // rollback: if the first request fails after the second's optimistic
    // update has already landed, the failure handler would restore the
    // pre-first-submit value and silently wipe the second, in-flight name.
    if (saving) return;

    const parsed = updateProfileSchema.safeParse({ displayName });
    if (!parsed.success) {
      setValidationError(parsed.error.issues[0]?.message ?? 'Please check your display name');
      return;
    }

    setValidationError(null);
    setSaveError(null);
    setJustSaved(false);
    setSaving(true);

    // Optimistic: the input already shows the new value; commit it as the
    // rollback target immediately rather than waiting on the network, then
    // reconcile in the background.
    const previous = savedDisplayName;
    setSavedDisplayName(parsed.data.displayName);
    setDisplayName(parsed.data.displayName);

    try {
      const user = await updateProfile(parsed.data);
      setSavedDisplayName(user.displayName);
      setDisplayName(user.displayName);
      setJustSaved(true);
    } catch (err) {
      setSavedDisplayName(previous);
      setDisplayName(previous);
      setSaveError(err instanceof ApiClientError ? err.message : 'Could not save your profile');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <p className="text-sm text-rt-ink-muted">Loading your profile…</p>;
  }

  if (loadError) {
    return (
      <p role="alert" className="text-sm text-red-600">
        {loadError}
      </p>
    );
  }

  const swatch = swatchForId(userId);
  // Nothing to save until the name differs from what is saved.
  const unchanged = displayName === savedDisplayName;

  return (
    <div className="flex flex-col gap-6">
      <section aria-labelledby="profile-title" className={SETTINGS_CARD}>
        <h2 id="profile-title" className={SETTINGS_CARD_TITLE}>
          Profile
        </h2>

        <div className="mt-6 flex items-center gap-4 border-b border-rt-tertiary/70 pb-6">
          <span
            aria-hidden
            className="flex size-16 shrink-0 items-center justify-center rounded-full text-[20px] font-semibold"
            style={{ background: swatch.background, color: swatch.color }}
          >
            {initialsFromName(savedDisplayName)}
          </span>
          <div className="min-w-0">
            <p className="truncate text-[16px] font-semibold text-rt-ink">{savedDisplayName}</p>
            <p className="mt-0.5 text-[13px] text-rt-ink-muted">
              Your initials show on your proposals and in the people list.
            </p>
          </div>
        </div>

        <form onSubmit={onSubmit} noValidate className="mt-6 flex flex-col gap-6">
          <div>
            <label className={FIELD}>
              Display name
              <input
                className={TEXT_INPUT}
                autoComplete="off"
                type="text"
                value={displayName}
                onChange={(e) => {
                  setDisplayName(e.target.value);
                  setJustSaved(false);
                }}
                maxLength={50}
                required
              />
            </label>
            <p className={FIELD_HINT}>
              What teammates see in lobbies, the people list and on your proposals.
            </p>
          </div>

          <div>
            <label className={FIELD}>
              Email
              <span className="relative">
                <input
                  className={`${TEXT_INPUT} cursor-default bg-rt-surface-alt pr-11 text-rt-ink-muted`}
                  type="email"
                  value={email}
                  readOnly
                />
                <Lock
                  aria-hidden
                  size={15}
                  className="absolute top-1/2 right-4 -translate-y-1/2 text-rt-ink-faint"
                />
              </span>
            </label>
            <p className={FIELD_HINT}>Used to sign in. It can’t be changed here.</p>
          </div>

          {validationError ? (
            <p role="alert" className="text-sm text-red-600">
              {validationError}
            </p>
          ) : null}
          {saveError ? (
            <p role="alert" className="text-sm text-red-600">
              {saveError}
            </p>
          ) : null}

          <div className="flex items-center justify-end gap-4">
            {justSaved ? <span className="text-sm text-rt-secondary-deep">Saved.</span> : null}
            <button type="submit" disabled={saving || unchanged} className={PRIMARY_BUTTON}>
              {saving ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        </form>
      </section>

      <DeleteAccountSection />
    </div>
  );
}
