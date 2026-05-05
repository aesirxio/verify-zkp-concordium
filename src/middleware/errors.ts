import type { NextFunction, Request, Response } from 'express';

export interface ApiError {
  code: string;
  message: string;
  retryable?: boolean;
  retryAfterSeconds?: number;
}

export class HttpError extends Error {
  status: number;
  payload: ApiError;

  constructor(status: number, payload: ApiError) {
    super(payload.message);
    this.status = status;
    this.payload = payload;
  }
}

export const apiError = (status: number, payload: ApiError): HttpError =>
  new HttpError(status, payload);

export const errorHandler = (
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
): void => {
  if (err instanceof HttpError) {
    if (err.payload.retryAfterSeconds !== undefined) {
      res.setHeader('Retry-After', String(err.payload.retryAfterSeconds));
    }
    res.status(err.status).json({ error: err.payload });
    return;
  }
  // Unknown error — log and 500
  // eslint-disable-next-line no-console
  console.error('Unhandled error:', err);
  res.status(500).json({
    error: {
      code: 'internal_error',
      message: 'Internal server error',
      retryable: false,
    },
  });
};
