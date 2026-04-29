import type { Request, Response } from 'express';
import { getVerificationSession } from '../sessions.js';

export const statusRoute = (
  req: Request<{ sessionId: string }>,
  res: Response
): void => {
  const session = getVerificationSession(req.params.sessionId);
  if (!session) {
    res.status(404).json({ error: 'Session not found or expired' });
    return;
  }
  res.json({
    sessionId: session.sessionId,
    status: session.status,
    anchorTransactionHash: session.anchorTransactionHash,
    error: session.error,
  });
};
