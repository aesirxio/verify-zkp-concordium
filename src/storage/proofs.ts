import { getRedis, k } from './redis.js';

export type ProofMode = 'direct' | 'batch';

export type DirectStatus =
  | 'pending'
  | 'submitted'
  | 'anchored'
  | 'confirmed'
  | 'failed';

export interface VerificationRef {
  chain: 'concordium';
  tx_hash: string;
  block_ref: string | null;
  contract_event_index: number;
}

export interface DirectProofRecord {
  proofReferenceId: string;
  receiptId: string;
  orgId: string;
  credentialId: string;
  proofMode: 'direct';
  status: DirectStatus;
  localEventHashHex: string;
  payload: Record<string, unknown>;
  verificationRef: VerificationRef;
  unitsConsumed: number;
  billableAmountUsd: number;
  issuedAt: string;
  /** Pointer back to the batch this proof belongs to, when applicable. */
  batchReferenceId?: string;
}

const proofKey = (proofReferenceId: string) => k('proof', proofReferenceId);

export const putDirectProof = async (rec: DirectProofRecord): Promise<void> => {
  await getRedis().set(proofKey(rec.proofReferenceId), JSON.stringify(rec));
};

export const getDirectProof = async (
  proofReferenceId: string
): Promise<DirectProofRecord | undefined> => {
  const raw = await getRedis().get(proofKey(proofReferenceId));
  return raw ? (JSON.parse(raw) as DirectProofRecord) : undefined;
};
