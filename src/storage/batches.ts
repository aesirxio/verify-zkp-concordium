import { getRedis, k } from './redis.js';
import type { VerificationRef } from './proofs.js';

export type BatchStatus =
  | 'open'
  | 'sealed'
  | 'submitted'
  | 'anchored'
  | 'confirmed'
  | 'failed';

export interface BatchLeaf {
  leafReference: string;
  leafIndex: number;
  proofReferenceId: string;
  leafHashHex: string;
  payload: Record<string, unknown>;
  inclusionPath?: string[];
}

export interface BatchRecord {
  batchReferenceId: string;
  orgId: string;
  credentialId: string;
  batchClass: string;
  batchWindowId?: string;
  status: BatchStatus;
  leafCount: number;
  merkleRootHex?: string;
  verificationRef?: VerificationRef;
  receiptId?: string;
  issuedAt?: string;
  unitsConsumed?: number;
  billableAmountUsd?: number;
  unitPriceUsd: number;
  createdAt: string;
  sealedAt?: string;
}

const batchKey = (batchReferenceId: string) => k('batch', batchReferenceId);
const leavesKey = (batchReferenceId: string) =>
  k('batch', batchReferenceId, 'leaves');
const openBatchKey = (orgId: string, batchClass: string, windowId?: string) =>
  windowId
    ? k('batch-open', orgId, batchClass, windowId)
    : k('batch-open', orgId, batchClass);

export const putBatch = async (rec: BatchRecord): Promise<void> => {
  await getRedis().set(batchKey(rec.batchReferenceId), JSON.stringify(rec));
};

export const getBatch = async (
  batchReferenceId: string
): Promise<BatchRecord | undefined> => {
  const raw = await getRedis().get(batchKey(batchReferenceId));
  return raw ? (JSON.parse(raw) as BatchRecord) : undefined;
};

/** Returns the open batch reference for (org, class[, window]), if any. */
export const getOpenBatchRef = async (
  orgId: string,
  batchClass: string,
  windowId?: string
): Promise<string | undefined> => {
  const v = await getRedis().get(openBatchKey(orgId, batchClass, windowId));
  return v ?? undefined;
};

export const setOpenBatchRef = async (
  orgId: string,
  batchClass: string,
  batchReferenceId: string,
  windowId?: string
): Promise<void> => {
  await getRedis().set(
    openBatchKey(orgId, batchClass, windowId),
    batchReferenceId
  );
};

export const clearOpenBatchRef = async (
  orgId: string,
  batchClass: string,
  windowId?: string
): Promise<void> => {
  await getRedis().del(openBatchKey(orgId, batchClass, windowId));
};

/** Atomically append a leaf and return its 0-based index. */
export const appendLeaf = async (
  batchReferenceId: string,
  leaf: Omit<BatchLeaf, 'leafIndex'>
): Promise<number> => {
  const r = getRedis();
  const newLen = await r.rpush(
    leavesKey(batchReferenceId),
    JSON.stringify({ ...leaf, leafIndex: -1 })
  );
  // We stored a placeholder index; rewrite at the assigned position with the real one.
  const leafIndex = newLen - 1;
  await r.lset(
    leavesKey(batchReferenceId),
    leafIndex,
    JSON.stringify({ ...leaf, leafIndex })
  );
  return leafIndex;
};

export const listLeaves = async (
  batchReferenceId: string
): Promise<BatchLeaf[]> => {
  const items = await getRedis().lrange(leavesKey(batchReferenceId), 0, -1);
  return items.map((s) => JSON.parse(s) as BatchLeaf);
};

export const replaceLeaves = async (
  batchReferenceId: string,
  leaves: BatchLeaf[]
): Promise<void> => {
  const r = getRedis();
  const key = leavesKey(batchReferenceId);
  const tx = r.multi();
  tx.del(key);
  for (const l of leaves) {
    tx.rpush(key, JSON.stringify(l));
  }
  await tx.exec();
};
