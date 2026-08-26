import type { NextFunction, Request, Response } from 'express';

// Consistent error shape across the API: { error: string, code?: string } (docs/05 §5).
// Throw ApiError from routes/handlers; everything else becomes a 500.
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
  ) {
    super(message);
  }
}

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  void _next;
  if (err instanceof ApiError) {
    res.status(err.status).json({ error: err.message, ...(err.code ? { code: err.code } : {}) });
    return;
  }
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error', code: 'INTERNAL' });
}
