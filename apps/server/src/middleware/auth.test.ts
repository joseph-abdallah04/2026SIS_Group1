import type { NextFunction, Request, Response } from 'express';
import { describe, expect, it, vi } from 'vitest';

import { signToken } from '../modules/auth/jwt.js';
import { allowQueryBearer, requireAuth } from './auth.js';

function mockReqRes(authorization?: string, query: Request['query'] = {}) {
  const req = { headers: { authorization }, query } as Request;
  const json = vi.fn();
  const status = vi.fn().mockReturnValue({ json });
  const res = { status } as unknown as Response;
  const next = vi.fn() as NextFunction;
  return { req, res, status, json, next };
}

describe('requireAuth', () => {
  it('401s with MISSING_TOKEN when there is no Authorization header', () => {
    const { req, res, status, json, next } = mockReqRes(undefined);
    requireAuth(req, res, next);
    expect(status).toHaveBeenCalledWith(401);
    expect(json).toHaveBeenCalledWith(expect.objectContaining({ code: 'MISSING_TOKEN' }));
    expect(next).not.toHaveBeenCalled();
  });

  it('401s with INVALID_TOKEN for a garbage bearer token', () => {
    const { req, res, status, json, next } = mockReqRes('Bearer not-a-real-token');
    requireAuth(req, res, next);
    expect(status).toHaveBeenCalledWith(401);
    expect(json).toHaveBeenCalledWith(expect.objectContaining({ code: 'INVALID_TOKEN' }));
    expect(next).not.toHaveBeenCalled();
  });

  it('calls next() and sets req.userId for a valid token', () => {
    const token = signToken({ userId: 'user-42' });
    const { req, res, status, next } = mockReqRes(`Bearer ${token}`);
    requireAuth(req, res, next);
    expect(status).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledTimes(1);
    expect(req.userId).toBe('user-42');
  });
});

describe('allowQueryBearer', () => {
  it('copies ?token= onto Authorization when the header is missing', () => {
    const { req, next } = mockReqRes(undefined, { token: 'query-jwt' });
    allowQueryBearer(req, {} as Response, next);
    expect(req.headers.authorization).toBe('Bearer query-jwt');
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('leaves an existing Authorization header alone', () => {
    const { req, next } = mockReqRes('Bearer header-jwt', { token: 'query-jwt' });
    allowQueryBearer(req, {} as Response, next);
    expect(req.headers.authorization).toBe('Bearer header-jwt');
  });
});
