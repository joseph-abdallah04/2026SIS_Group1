import { describe, expect, it } from 'vitest';

import { toPublicUser } from './service.js';

// Pure logic only — no DB, mirrors pinboard/service.test.ts's toBoardItem test.

describe('toPublicUser', () => {
  it('strips passwordHash and stringifies createdAt', () => {
    const row = {
      id: 'user-1',
      email: 'alice@example.com',
      displayName: 'Alice',
      passwordHash: '$2b$10$shouldNeverAppearInOutput',
      createdAt: new Date('2026-09-01T12:00:00.000Z'),
    };

    expect(toPublicUser(row)).toEqual({
      id: 'user-1',
      email: 'alice@example.com',
      displayName: 'Alice',
      createdAt: '2026-09-01T12:00:00.000Z',
    });
  });
});
