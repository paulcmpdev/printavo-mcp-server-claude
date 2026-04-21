import { describe, it, expect, vi } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import { buildMcpAuthMiddleware } from '../src/auth.js';

function mockReq(headers: Record<string, string>): Request {
  return { headers } as unknown as Request;
}

function mockRes() {
  const res = {
    statusCode: 0,
    body: undefined as unknown,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(body: unknown) {
      this.body = body;
      return this;
    },
  };
  return res as unknown as Response & { statusCode: number; body: unknown };
}

describe('mcpAuthMiddleware', () => {
  const KEY = 'super-secret-test-key-1234567890';
  const middleware = buildMcpAuthMiddleware(KEY);

  it('rejects requests with no auth header', () => {
    const next: NextFunction = vi.fn();
    const res = mockRes();
    middleware(mockReq({}), res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
  });

  it('rejects an invalid Bearer token', () => {
    const next: NextFunction = vi.fn();
    const res = mockRes();
    middleware(mockReq({ authorization: 'Bearer wrong' }), res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
  });

  it('accepts a valid Bearer token', () => {
    const next: NextFunction = vi.fn();
    const res = mockRes();
    middleware(mockReq({ authorization: `Bearer ${KEY}` }), res, next);
    expect(next).toHaveBeenCalled();
  });

  it('accepts a valid x-api-key header', () => {
    const next: NextFunction = vi.fn();
    const res = mockRes();
    middleware(mockReq({ 'x-api-key': KEY }), res, next);
    expect(next).toHaveBeenCalled();
  });

  it('accepts a bare Authorization header (no Bearer prefix)', () => {
    const next: NextFunction = vi.fn();
    const res = mockRes();
    middleware(mockReq({ authorization: KEY }), res, next);
    expect(next).toHaveBeenCalled();
  });

  it('rejects when token is the wrong length (timing-safe path)', () => {
    const next: NextFunction = vi.fn();
    const res = mockRes();
    middleware(mockReq({ authorization: 'Bearer short' }), res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
  });
});
