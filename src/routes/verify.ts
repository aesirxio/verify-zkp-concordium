import { randomUUID } from 'node:crypto';
import type { Request, Response } from 'express';
import { getVerificationSession, setVerificationSession } from '../sessions.js';
import { verifyPresentation } from '../verifier-service.js';

interface VerifyBody {
  sessionId?: string;
  presentation?: unknown;
  verificationRequest?: unknown;
}

export const verifyRoute = async (
  req: Request<unknown, unknown, VerifyBody>,
  res: Response
): Promise<void> => {
  try {
    const { sessionId, presentation, verificationRequest } = req.body ?? {};

    if (!sessionId || !presentation || !verificationRequest) {
      res.status(400).json({
        error:
          'sessionId, presentation (VP), and verificationRequest (VPR) are required',
      });
      return;
    }

    const session = getVerificationSession(sessionId);
    if (!session) {
      res.status(404).json({ error: 'Session not found or expired' });
      return;
    }

    // Allow retry on previously failed sessions (iOS resend flow).
    if (session.status === 'failed') {
      session.status = 'pending';
    } else if (session.status !== 'pending') {
      res.status(409).json({ error: `Session is already ${session.status}` });
      return;
    }

    const auditRecordId = randomUUID();

    const result = await verifyPresentation({
      auditRecordId,
      presentation,
      verificationRequest,
    });

    if (result.result === 'verified') {
      setVerificationSession({
        ...session,
        status: 'verified',
        verificationAuditRecord: result.verificationAuditRecord,
        anchorTransactionHash: result.anchorTransactionHash,
      });
      res.json({
        status: 'verified',
        anchorTransactionHash: result.anchorTransactionHash,
      });
      return;
    }

    const failReason =
      result.reason || result.error || 'Unknown verification failure';
    setVerificationSession({ ...session, status: 'failed', error: failReason });
    res.status(403).json({ status: 'failed', error: failReason });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[verify] error:', message);
    res.status(500).json({ error: message });
  }
};
