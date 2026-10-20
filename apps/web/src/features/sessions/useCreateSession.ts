import { useCallback, useState } from 'react';
import type { Session } from '@roundtable/shared';
import type { CreateSessionInput } from '@roundtable/shared/schemas';

import { api, ApiClientError } from '../../lib/api';

/** What came of creating a session and opening it in one go. */
export type CreateAndOpenResult =
  /** Open, with the code people join by. */
  | { sessionId: string; opened: true; code: string | null }
  /** Created as a draft, but it would not open: the draft page says why and offers it again. */
  | { sessionId: string; opened: false; openError: string };

function message(err: unknown, fallback: string) {
  return err instanceof ApiClientError ? err.message : fallback;
}

export function useCreateSession() {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const create = useCallback(async (input: CreateSessionInput): Promise<Session | null> => {
    setSubmitting(true);
    setError(null);
    try {
      return await api.post<Session>('/api/sessions', input);
    } catch (err) {
      setError(message(err, 'Failed to create session'));
      return null;
    } finally {
      setSubmitting(false);
    }
  }, []);

  /**
   * "Open the room": creates the draft and opens it for joining (F06), so the
   * leader lands in the waiting room without the draft page in between. Two
   * calls the server already has; if the second fails, the draft is kept.
   */
  const createAndOpen = useCallback(
    async (input: CreateSessionInput): Promise<CreateAndOpenResult | null> => {
      setSubmitting(true);
      setError(null);
      let session: Session;
      try {
        session = await api.post<Session>('/api/sessions', input);
      } catch (err) {
        setError(message(err, 'Failed to create session'));
        setSubmitting(false);
        return null;
      }
      try {
        const open = await api.post<Session>(`/api/sessions/${session.id}/open`, {});
        return { sessionId: session.id, opened: true, code: open.code };
      } catch (err) {
        return {
          sessionId: session.id,
          opened: false,
          openError: message(err, 'Failed to open the session'),
        };
      } finally {
        setSubmitting(false);
      }
    },
    [],
  );

  return { create, createAndOpen, submitting, error };
}
