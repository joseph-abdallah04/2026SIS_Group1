import { useCallback, useState } from 'react';
import type { Session } from '@roundtable/shared';
import type { CreateSessionInput } from '@roundtable/shared/schemas';

import { api, ApiClientError } from '../../lib/api';

export function useCreateSession() {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const create = useCallback(async (input: CreateSessionInput): Promise<Session | null> => {
    setSubmitting(true);
    setError(null);
    try {
      return await api.post<Session>('/api/sessions', input);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Failed to create session');
      return null;
    } finally {
      setSubmitting(false);
    }
  }, []);

  return { create, submitting, error };
}
