import { describe, expect, it } from 'vitest';
import type { DiagramArtifact } from '@roundtable/shared';

import {
  clearStudioDraft,
  isDraftWorthKeeping,
  readStudioDraft,
  studioDraftKey,
  writeStudioDraft,
  type StudioDraftScope,
} from './studioDraft';

/** A storage that behaves, and one that does not. */
function memoryStorage(): Storage {
  const entries = new Map<string, string>();
  return {
    get length() {
      return entries.size;
    },
    clear: () => entries.clear(),
    getItem: (key) => entries.get(key) ?? null,
    key: (index) => [...entries.keys()][index] ?? null,
    removeItem: (key) => void entries.delete(key),
    setItem: (key, value) => void entries.set(key, value),
  };
}

function hostileStorage(): Storage {
  return {
    length: 0,
    clear: () => {},
    getItem: () => {
      throw new Error('blocked');
    },
    key: () => null,
    removeItem: () => {
      throw new Error('blocked');
    },
    setItem: () => {
      throw new Error('quota exceeded');
    },
  };
}

const compose: StudioDraftScope = { sessionId: 's1', questionId: 'q1', mode: 'compose' };

const artifact = (): DiagramArtifact => ({
  type: 'diagram',
  nodes: [{ id: 'n1', label: 'Idea', x: 24, y: 24, shape: 'box' }],
  edges: [],
});

describe('what a draft belongs to', () => {
  it('keeps a session, a question and a mode apart', () => {
    const keys = new Set([
      studioDraftKey(compose),
      studioDraftKey({ ...compose, sessionId: 's2' }),
      studioDraftKey({ ...compose, questionId: 'q2' }),
      studioDraftKey({ ...compose, mode: 'extend', sourceId: 'p1' }),
    ]);
    expect(keys.size).toBe(4);
  });

  it('keeps two edits of different proposals apart', () => {
    // An edit belongs to the proposal it rewrites; two of them are two drafts.
    expect(studioDraftKey({ ...compose, mode: 'edit', sourceId: 'p1' })).not.toBe(
      studioDraftKey({ ...compose, mode: 'edit', sourceId: 'p2' }),
    );
  });
});

describe('keeping and finding a draft', () => {
  it('gives back what was kept', () => {
    const storage = memoryStorage();
    writeStudioDraft(storage, compose, artifact());
    expect(readStudioDraft(storage, compose)?.nodes[0]?.label).toBe('Idea');
  });

  it('offers a draft only to the scope that made it', () => {
    // A half-written extension must never turn up for someone starting fresh.
    const storage = memoryStorage();
    writeStudioDraft(storage, { ...compose, mode: 'extend', sourceId: 'p1' }, artifact());
    expect(readStudioDraft(storage, compose)).toBeNull();
  });

  it('has nothing to give before anything is kept', () => {
    expect(readStudioDraft(memoryStorage(), compose)).toBeNull();
  });

  it('forgets a draft when it is cleared', () => {
    const storage = memoryStorage();
    writeStudioDraft(storage, compose, artifact());
    clearStudioDraft(storage, compose);
    expect(readStudioDraft(storage, compose)).toBeNull();
  });

  it('carries the whole canvas, not only its shapes', () => {
    // Keeping half a canvas would be its own way of losing work.
    const storage = memoryStorage();
    writeStudioDraft(storage, compose, {
      ...artifact(),
      ink: [{ id: 'i1', points: [0, 0, 10, 10] }],
      paths: [
        {
          id: 'p1',
          anchors: [
            { x: 0, y: 0 },
            { x: 10, y: 10 },
          ],
        },
      ],
      tables: [
        {
          id: 't1',
          x: 0,
          y: 0,
          colWidths: [80],
          rowHeights: [32],
          cells: [{ text: 'Time' }],
        },
      ],
      z: ['n1', 'i1'],
    });

    const back = readStudioDraft(storage, compose);
    expect(back?.ink).toHaveLength(1);
    expect(back?.paths).toHaveLength(1);
    expect(back?.tables?.[0]?.cells[0]?.text).toBe('Time');
    expect(back?.z).toEqual(['n1', 'i1']);
  });
});

describe('a draft that cannot be trusted', () => {
  it('drops one that is not a diagram at all', () => {
    // Storage is written by whatever build ran last, and can be edited by hand.
    const storage = memoryStorage();
    storage.setItem(studioDraftKey(compose), JSON.stringify({ type: 'sticky', text: 'hi' }));
    expect(readStudioDraft(storage, compose)).toBeNull();
  });

  it('drops one that is not JSON', () => {
    const storage = memoryStorage();
    storage.setItem(studioDraftKey(compose), 'half a wri');
    expect(readStudioDraft(storage, compose)).toBeNull();
  });

  it('keeps the shapes when only the sketch is unreadable', () => {
    // The read schema is deliberately lenient: ink this build cannot make sense
    // of degrades to no ink rather than throwing the diagram away with it.
    const storage = memoryStorage();
    storage.setItem(
      studioDraftKey(compose),
      JSON.stringify({ ...artifact(), ink: 'not an array' }),
    );
    const back = readStudioDraft(storage, compose);
    expect(back?.nodes).toHaveLength(1);
    expect(back?.ink).toBeUndefined();
  });
});

describe('when storage will not cooperate', () => {
  it('reads nothing rather than failing to open the editor', () => {
    expect(readStudioDraft(hostileStorage(), compose)).toBeNull();
    expect(readStudioDraft(undefined, compose)).toBeNull();
  });

  it('gives up on a write quietly', () => {
    // Storage full means the canvas is no safer than before any of this existed,
    // which is not worth interrupting someone mid-draw to say.
    expect(() => writeStudioDraft(hostileStorage(), compose, artifact())).not.toThrow();
    expect(() => writeStudioDraft(undefined, compose, artifact())).not.toThrow();
    expect(() => clearStudioDraft(hostileStorage(), compose)).not.toThrow();
  });
});

describe('what is worth keeping', () => {
  it('counts any element, of any kind', () => {
    expect(isDraftWorthKeeping(artifact())).toBe(true);
    expect(
      isDraftWorthKeeping({
        type: 'diagram',
        nodes: [],
        edges: [],
        ink: [{ id: 'i', points: [0, 0] }],
      }),
    ).toBe(true);
  });

  it('counts a canvas of nothing but arrows', () => {
    // An arrow is work like any other element. Left out of this, a canvas of
    // only arrows read as empty and was thrown away on the way out.
    expect(
      isDraftWorthKeeping({
        type: 'diagram',
        nodes: [],
        edges: [],
        arrows: [{ id: 'a1', from: { x: 0, y: 0 }, to: { x: 80, y: 40 } }],
      }),
    ).toBe(true);
  });

  it('does not count an empty canvas', () => {
    // Nothing has been done yet, so there is nothing to come back to.
    expect(isDraftWorthKeeping({ type: 'diagram', nodes: [], edges: [] })).toBe(false);
  });
});
