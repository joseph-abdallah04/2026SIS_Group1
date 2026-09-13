import http from 'node:http';
import type { AddressInfo } from 'node:net';

import express from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError } from '../../middleware/error.js';
import { errorHandler } from '../../middleware/error.js';

const getSessionSummary = vi.fn();
const getSessionSummaryPdf = vi.fn();

vi.mock('../../middleware/auth.js', () => ({
  requireAuth: (
    req: express.Request,
    res: express.Response,
    next: express.NextFunction,
  ) => {
    const userId = req.headers['x-test-user-id'];
    if (typeof userId !== 'string' || !userId) {
      res.status(401).json({ error: 'Missing authentication token', code: 'MISSING_TOKEN' });
      return;
    }
    req.userId = userId;
    next();
  },
}));

vi.mock('./service.js', () => ({ getSessionSummary, getSessionSummaryPdf }));

const { summaryRoutes } = await import('./routes.js');

function createApp() {
  const app = express();
  app.use('/api/sessions', summaryRoutes);
  app.use(errorHandler);
  return app;
}

async function request({
  userId = 'u1',
  path = '/api/sessions/s1/summary.pdf',
}: {
  userId?: string;
  path?: string;
} = {}): Promise<{ status: number; headers: Headers; body: Buffer }> {
  const server = http.createServer(createApp());
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });
  const { port } = server.address() as AddressInfo;
  try {
    const res = await fetch(`http://127.0.0.1:${port}${path}`, {
      headers: userId ? { 'x-test-user-id': userId } : {},
    });
    return {
      status: res.status,
      headers: res.headers,
      body: Buffer.from(await res.arrayBuffer()),
    };
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  }
}

beforeEach(() => {
  vi.clearAllMocks();
  getSessionSummaryPdf.mockResolvedValue({
    pdf: Buffer.from('%PDF-1.4 recap'),
    filename: 'Roadmap-recap.pdf',
  });
});

describe('GET /api/sessions/:sessionId/summary.pdf', () => {
  it('401s when the caller has no identity', async () => {
    const res = await request({ userId: '' });
    expect(res.status).toBe(401);
    expect(getSessionSummaryPdf).not.toHaveBeenCalled();
  });

  it('403s a stranger and never builds a file', async () => {
    getSessionSummaryPdf.mockRejectedValue(
      new ApiError(403, 'You are not a member of this session', 'NOT_SESSION_MEMBER'),
    );
    const res = await request({ userId: 'stranger' });
    expect(res.status).toBe(403);
    expect(JSON.parse(res.body.toString())).toMatchObject({ code: 'NOT_SESSION_MEMBER' });
  });

  it('sends the PDF as an attachment once both gates pass', async () => {
    const res = await request();
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toMatch(/pdf/);
    expect(res.headers.get('content-disposition')).toBe(
      'attachment; filename="Roadmap-recap.pdf"',
    );
    expect(res.headers.get('cache-control')).toBe('private, no-store');
    expect(res.body.subarray(0, 5).toString()).toBe('%PDF-');
    expect(getSessionSummaryPdf).toHaveBeenCalledWith('s1', 'u1');
  });
});
