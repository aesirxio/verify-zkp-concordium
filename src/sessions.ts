import { SESSION_TTL_MS } from './config.js';

export type SessionStatus = 'pending' | 'verified' | 'failed' | 'expired';

export interface VerificationSession {
  sessionId: string;
  status: SessionStatus;
  createdAt: number;
  connectionId: string;
  vpr: unknown;
  transactionRef?: string;
  verificationAuditRecord?: unknown;
  anchorTransactionHash?: string;
  error?: string;
}

const globalForSessions = globalThis as unknown as {
  __verificationSessions?: Map<string, VerificationSession>;
  __verificationCleanupTimer?: NodeJS.Timeout;
};

const sessions =
  globalForSessions.__verificationSessions ??
  new Map<string, VerificationSession>();
globalForSessions.__verificationSessions = sessions;

if (!globalForSessions.__verificationCleanupTimer) {
  globalForSessions.__verificationCleanupTimer = setInterval(() => {
    const now = Date.now();
    for (const [id, session] of sessions) {
      if (now - session.createdAt > SESSION_TTL_MS) {
        sessions.delete(id);
      }
    }
  }, 30_000);
}

export const getVerificationSession = (
  sessionId: string
): VerificationSession | undefined => sessions.get(sessionId);

export const setVerificationSession = (session: VerificationSession): void => {
  sessions.set(session.sessionId, session);
};

export const deleteVerificationSession = (sessionId: string): void => {
  sessions.delete(sessionId);
};
