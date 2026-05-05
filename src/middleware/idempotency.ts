import type { NextFunction, Request, Response } from 'express';

import { getIdempotency, setIdempotency } from '../storage/idempotency.js';
import { apiError } from './errors.js';

/**
 * Replay-safe wrapper: if a prior response was stored for
 * (credentialId, idempotencyKey), replay it; otherwise capture the new
 * response on the way out and persist it.
 *
 * Replays only when the new request body matches the stored one; a different
 * body returns `replayed_request` per contract §2.4.
 */
export const idempotent = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const ctx = req.aps;
  if (!ctx) {
    next(apiError(500, { code: 'internal_error', message: 'missing auth context' }));
    return;
  }

  const existing = await getIdempotency(ctx.credentialId, ctx.idempotencyKey);
  if (existing) {
    if (existing.bodyHashHex !== ctx.bodyHashHex) {
      next(
        apiError(401, {
          code: 'replayed_request',
          message: 'idempotency key reused with a different body',
          retryable: false,
        })
      );
      return;
    }
    res.status(existing.status).type('application/json').send(existing.responseBody);
    return;
  }

  // Wrap res.json so we capture the response for future replays.
  const origJson = res.json.bind(res);
  res.json = (body: unknown) => {
    const status = res.statusCode || 200;
    const serialized = JSON.stringify(body);
    void setIdempotency(ctx.credentialId, ctx.idempotencyKey, {
      bodyHashHex: ctx.bodyHashHex,
      status,
      responseBody: serialized,
      storedAt: new Date().toISOString(),
    }).catch((err) => {
      // eslint-disable-next-line no-console
      console.error('idempotency store failed', err);
    });
    return origJson(body);
  };

  next();
};
