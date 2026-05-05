import {
  AccountTransactionType,
  DataBlob,
  TransactionExpiry,
  TransactionHash,
  signTransaction,
  type AccountTransaction,
  type AccountTransactionHeader,
  type RegisterDataPayload,
} from '@concordium/web-sdk';

import { ANCHOR_FINALITY_TIMEOUT_MS } from '../config.js';
import { encodeAnchor } from './envelope.js';
import { getGrpcClient, getSender, getSigner } from './client.js';

export type AnchorStatus = 'submitted' | 'finalized';

export interface AnchorReceipt {
  txHash: string;
  blockHash?: string;
  status: AnchorStatus;
}

/**
 * Build a CCDPRA envelope, wrap it in a RegisterData transaction, sign it with
 * the configured AesirX account, submit to the node, and (best-effort) wait
 * for finalization within {@link ANCHOR_FINALITY_TIMEOUT_MS}.
 *
 * Returns the transaction hash plus the finalized block hash if reached. If
 * finalization times out the receipt is returned with status='submitted' and
 * the caller can poll later.
 */
export const anchorHash = async (
  hash: Uint8Array,
  publicInfo?: Record<string, unknown>
): Promise<AnchorReceipt> => {
  const client = getGrpcClient();
  const sender = getSender();
  const signer = getSigner();

  const envelope = encodeAnchor({ hash, public: publicInfo });
  if (envelope.byteLength > 256) {
    throw new Error(
      `CCDPRA envelope too large for RegisterData (${envelope.byteLength}B > 256B)`
    );
  }

  const nonce = await client.getNextAccountNonce(sender);
  const header: AccountTransactionHeader = {
    sender,
    nonce: nonce.nonce,
    expiry: TransactionExpiry.futureMinutes(5),
  };
  // Copy envelope bytes into a fresh ArrayBuffer for DataBlob.
  const envBytes = new ArrayBuffer(envelope.byteLength);
  new Uint8Array(envBytes).set(envelope);
  const payload: RegisterDataPayload = {
    data: new DataBlob(envBytes),
  };
  const transaction: AccountTransaction = {
    header,
    payload,
    type: AccountTransactionType.RegisterData,
  };

  const signature = await signTransaction(transaction, signer);
  const txHashType = await client.sendAccountTransaction(transaction, signature);
  const txHash = TransactionHash.toHexString(txHashType);

  try {
    const outcome = await client.waitForTransactionFinalization(
      txHashType,
      ANCHOR_FINALITY_TIMEOUT_MS
    );
    return {
      txHash,
      blockHash: outcome.blockHash ? String(outcome.blockHash) : undefined,
      status: 'finalized',
    };
  } catch {
    return { txHash, status: 'submitted' };
  }
};
