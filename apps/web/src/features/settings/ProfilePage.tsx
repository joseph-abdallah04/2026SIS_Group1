import { useEffect, useState, type FormEvent } from 'react';
import { updateProfileSchema } from '@roundtable/shared/schemas';

import { ApiClientError } from '../../lib/api';
import { getMe, updateProfile } from '../auth/api';

const INPUT_CLASSES =
  'w-full rounded-full border border-rt-tertiary bg-rt-surface px-5 py-3 text-sm text-rt-ink placeholder:text-rt-ink-faint focus-visible:ring-2 focus-visible:ring-rt-primary-deep focus-visible:outline-none';

const LABEL_CLASSES =
  'flex flex-col gap-2 text-xs font-semibold uppercase tracking-wide text-rt-ink-muted';

/**
 * Content for the "Profile" tab of /settings — no page chrome of its own,
 * that lives in SettingsPage (the tab shell).
 */
export function ProfilePage() {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
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

  return (
    <div>
      <p className="mb-8 max-w-xl text-sm text-rt-ink-muted">
        Your display name is what teammates see in waiting rooms, participant lists, and voting
        screens.
      </p>

      <div className="mb-6 flex flex-col gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-rt-ink-muted">
          Email
        </span>
        <span className="text-sm text-rt-ink">{email}</span>
      </div>

      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-6">
        <label className={LABEL_CLASSES}>
          Display name
          <input
            className={INPUT_CLASSES}
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

        <div className="flex items-center justify-end gap-4 border-t border-dashed border-rt-tertiary pt-6">
          {justSaved ? <span className="text-sm text-rt-primary-deep">Saved.</span> : null}
          <button
            type="submit"
            disabled={saving}
            className="rounded-full bg-rt-secondary px-6 py-3 text-sm font-semibold text-rt-ink transition-colors hover:bg-rt-secondary-deep hover:text-white focus-visible:ring-2 focus-visible:ring-rt-primary-deep focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </form>
    </div>
  );
}
