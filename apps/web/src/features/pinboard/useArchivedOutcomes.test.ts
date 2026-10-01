import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const get = vi.fn();

vi.mock('../../lib/api', () => ({
  api: { get: (...args: unknown[]) => get(...args) },
}));

const { useArchivedOutcomes } = await import('./useArchivedOutcomes');

beforeEach(() => {
  get.mockReset();
});

describe('useArchivedOutcomes', () => {
  it('keeps a list of id-only results', async () => {
    get.mockResolvedValue([
      {
        questionId: 'q1',
        proposalIds: ['p1'],
        winnerProposalId: 'p1',
        tiedProposalIds: [],
      },
    ]);

    const { result } = renderHook(() => useArchivedOutcomes('s1'));
    await waitFor(() => expect(result.current).toHaveLength(1));
    expect(result.current?.[0]?.winnerProposalId).toBe('p1');
  });

  it('drops a payload that is not that shape', async () => {
    get.mockResolvedValue([{ questionId: 'q1', votes: 3 }]);

    const { result } = renderHook(() => useArchivedOutcomes('s1'));
    await waitFor(() => expect(result.current).toEqual([]));
  });
});
