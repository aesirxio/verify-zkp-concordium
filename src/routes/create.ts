import { randomUUID } from 'node:crypto';
import type { Request, Response } from 'express';
import { DEFAULT_CONTEXT_STRING, DEFAULT_RESOURCE_ID } from '../config.js';
import { setVerificationSession } from '../sessions.js';
import { buildStatements, type StatementParams } from '../statement.js';
import { createVerificationRequest } from '../verifier-service.js';

interface CreateBody {
  connectionId?: string;
  statement?: StatementParams;
  contextString?: string;
  resourceId?: string;
}

export const createRoute = async (
  req: Request<unknown, unknown, CreateBody>,
  res: Response
): Promise<void> => {
  try {
    const { connectionId, statement, contextString, resourceId } = req.body ?? {};

    if (!connectionId || typeof connectionId !== 'string') {
      res.status(400).json({
        error: 'connectionId (WalletConnect session topic) is required',
      });
      return;
    }
    if (!statement || typeof statement !== 'object') {
      res.status(400).json({ error: 'statement params are required' });
      return;
    }

    const statements = buildStatements(statement);
    const sessionId = randomUUID();

    const { vpr, transactionRef } = await createVerificationRequest({
      connectionId,
      resourceId: resourceId || DEFAULT_RESOURCE_ID,
      contextString: contextString || DEFAULT_CONTEXT_STRING,
      statements,
    });

    setVerificationSession({
      sessionId,
      status: 'pending',
      createdAt: Date.now(),
      connectionId,
      vpr,
      transactionRef,
    });

    res.json({ sessionId, vpr });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[create] error:', message);
    res.status(500).json({ error: message });
  }
};
