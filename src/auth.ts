/**
 * Authentication middleware for the MCP endpoint.
 *
 * Uses crypto.timingSafeEqual to defend against timing attacks on the
 * Bearer token comparison.
 */

import type { Request, Response, NextFunction } from 'express';
import { timingSafeEqual } from 'node:crypto';

function jsonRpcError(code: number, message: string) {
  return { jsonrpc: '2.0', error: { code, message }, id: null };
}

/** Constant-time string comparison. Returns false if lengths differ. */
function safeStringEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/** Extract a Bearer token from common headers. */
function extractToken(req: Request): string | null {
  const authHeader = (req.headers['authorization'] as string | undefined) ?? '';
  const xApiKey = (req.headers['x-api-key'] as string | undefined) ?? '';

  if (authHeader.startsWith('Bearer ')) return authHeader.slice(7).trim();
  if (xApiKey) return xApiKey.trim();
  if (authHeader) return authHeader.trim();
  return null;
}

export function buildMcpAuthMiddleware(expectedKey: string) {
  return function mcpAuthMiddleware(req: Request, res: Response, next: NextFunction): void {
    const token = extractToken(req);

    if (!token) {
      res.status(401).json(jsonRpcError(-32001, 'Unauthorized: Missing API key.'));
      return;
    }

    if (!safeStringEqual(token, expectedKey)) {
      res.status(401).json(jsonRpcError(-32001, 'Unauthorized: Invalid API key.'));
      return;
    }

    next();
  };
}
