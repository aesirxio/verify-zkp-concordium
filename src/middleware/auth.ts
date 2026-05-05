import { createHmac, timingSafeEqual } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

import { HMAC_TIMESTAMP_SKEW_SEC } from '../config.js';
import { sha256Hex } from '../chain/hash.js';
import { getCredential } from '../storage/credentials.js';
import { apiError } from './errors.js';

export interface AuthContext {
  orgId: string;
  credentialId: string;
  idempotencyKey: string;
  bodyHashHex: string;
  timestamp: string;
}

declare module 'express-serve-static-core' {
  // eslint-disable-next-line @typescript-eslint/no-empty-interface
  interface Request {
    aps?: AuthContext;
    rawBody?: Buffer;
  }
}

const FUTURE_SKEW_SEC = 60; // contract §2.4: timestamp newer than 1 minute = stale

const required = (req: Request, header: string): string => {
  const v = req.header(header);
  if (!v) {
    throw apiError(401, {
      code: 'invalid_signature',
      message: `missing required header ${header}`,
      retryable: false,
    });
  }
  return v;
};

const canonicalPath = (req: Request): string => {
  // Path with query string in alphabetical order, per contract §2.3.
  const url = new URL(req.originalUrl, 'http://local');
  const params = [...url.searchParams.entries()].sort(([a], [b]) =>
    a < b ? -1 : a > b ? 1 : 0
  );
  if (params.length === 0) return url.pathname;
  const qs = params
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');
  return `${url.pathname}?${qs}`;
};

export const requireHmac = async (
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const orgId = required(req, 'X-Aesirx-Org-Id');
    const credentialId = required(req, 'X-Aesirx-Credential-Id');
    const timestamp = required(req, 'X-Aesirx-Timestamp');
    const idempotencyKey = required(req, 'X-Aesirx-Idempotency-Key');
    const signatureHex = required(req, 'X-Aesirx-Signature');

    // Timestamp skew check (contract §2.4)
    const ts = Date.parse(timestamp);
    if (Number.isNaN(ts)) {
      throw apiError(401, {
        code: 'stale_timestamp',
        message: 'invalid timestamp',
        retryable: false,
      });
    }
    const nowMs = Date.now();
    const ageSec = (nowMs - ts) / 1000;
    if (ageSec > HMAC_TIMESTAMP_SKEW_SEC || ageSec < -FUTURE_SKEW_SEC) {
      throw apiError(401, {
        code: 'stale_timestamp',
        message: 'timestamp outside accepted window',
        retryable: false,
      });
    }

    const cred = await getCredential(credentialId);
    if (!cred || cred.revokedAt) {
      throw apiError(401, {
        code: 'invalid_credential',
        message: 'unknown or revoked credential',
        retryable: false,
      });
    }
    if (cred.orgId !== orgId) {
      throw apiError(403, {
        code: 'org_mismatch',
        message: 'credential not bound to supplied org',
        retryable: false,
      });
    }

    const rawBody = req.rawBody ?? Buffer.alloc(0);
    const bodyHashHex = sha256Hex(rawBody);
    const canonical = [
      req.method.toUpperCase(),
      canonicalPath(req),
      timestamp,
      orgId,
      idempotencyKey,
      bodyHashHex,
    ].join('\n');

    const expected = createHmac('sha256', cred.secret)
      .update(canonical)
      .digest();

    let provided: Buffer;
    try {
      provided = Buffer.from(signatureHex, 'hex');
    } catch {
      throw apiError(401, {
        code: 'invalid_signature',
        message: 'signature is not valid hex',
        retryable: false,
      });
    }
    if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
      throw apiError(401, {
        code: 'invalid_signature',
        message: 'signature mismatch',
        retryable: false,
      });
    }

    req.aps = {
      orgId,
      credentialId,
      idempotencyKey,
      bodyHashHex,
      timestamp,
    };
    next();
  } catch (err) {
    next(err);
  }
};
