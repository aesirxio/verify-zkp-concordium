import { ISSUERS, VERIFIER_SERVICE_URL } from './config.js';
import type { Statement } from './statement.js';

export interface CreateVPRParams {
  connectionId: string;
  resourceId: string;
  contextString: string;
  statements: Statement[];
}

export const createVerificationRequest = async (
  params: CreateVPRParams
): Promise<{ vpr: unknown; transactionRef?: string }> => {
  const body = {
    connectionId: params.connectionId,
    resourceId: params.resourceId,
    contextString: params.contextString,
    requestedClaims: [
      {
        type: 'identity',
        source: ['identityCredential'],
        issuers: ISSUERS,
        statements: params.statements,
      },
    ],
  };

  const response = await fetch(
    `${VERIFIER_SERVICE_URL}/verifiable-presentations/create-verification-request`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `Verifier Service create-verification-request failed: ${response.status} ${text}`
    );
  }

  const vpr = await response.json();
  return { vpr, transactionRef: (vpr as { transactionRef?: string })?.transactionRef };
};

export interface VerifyVPParams {
  auditRecordId: string;
  presentation: unknown;
  verificationRequest: unknown;
}

export interface VerifyVPResult {
  result: 'verified' | 'failed' | string;
  reason?: string;
  error?: string;
  verificationAuditRecord?: unknown;
  anchorTransactionHash?: string;
}

export const verifyPresentation = async (
  params: VerifyVPParams
): Promise<VerifyVPResult> => {
  // age-gated-news handles WC wrapper unwrap — same logic here
  const raw = params.presentation as Record<string, unknown>;
  const presentation = raw.verifiablePresentationJson ?? raw;

  const body = {
    auditRecordId: params.auditRecordId,
    presentation,
    verificationRequest: params.verificationRequest,
  };

  const response = await fetch(
    `${VERIFIER_SERVICE_URL}/verifiable-presentations/verify`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }
  );

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Verifier Service verify failed: ${response.status} ${text}`);
  }

  try {
    return JSON.parse(text) as VerifyVPResult;
  } catch {
    throw new Error(`Failed to parse verifier response: ${text}`);
  }
};
