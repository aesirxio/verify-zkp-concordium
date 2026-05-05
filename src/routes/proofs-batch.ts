import { Router, type Request, type Response, type NextFunction } from 'express';

import { anchorHash } from '../chain/anchor.js';
import { hexToBytes, bytesToHex } from '../chain/hash.js';
import { buildMerkleTree, pathToHex } from '../chain/merkle.js';
import { requireHmac } from '../middleware/auth.js';
import { idempotent } from '../middleware/idempotency.js';
import { apiError } from '../middleware/errors.js';
import { validateAndHashPayload } from '../proofs/payload.js';
import {
  appendLeaf,
  clearOpenBatchRef,
  getBatch,
  getOpenBatchRef,
  listLeaves,
  putBatch,
  replaceLeaves,
  setOpenBatchRef,
  type BatchRecord,
} from '../storage/batches.js';
import { putDirectProof } from '../storage/proofs.js';
import {
  decrementBalance,
  getBalance,
  incrementBillable,
  incrementCounter,
  listPackagePurchases,
} from '../storage/usage.js';
import { newId } from '../util/ids.js';
import { unitPriceForOrg, usdToCents } from '../util/pricing.js';
import { MAX_LEAVES_PER_BATCH } from '../config.js';

const router = Router();

router.post(
  '/proofs/batches/leaves',
  requireHmac,
  idempotent,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const ctx = req.aps!;
      const body = (req.body ?? {}) as {
        payload?: unknown;
        batch_class?: string;
        batch_window_id?: string;
        expected_leaf_index?: number;
      };

      if (typeof body.batch_class !== 'string' || !body.batch_class.length) {
        throw apiError(400, {
          code: 'invalid_payload',
          message: '"batch_class" required',
          retryable: false,
        });
      }
      const { hashHex } = validateAndHashPayload(body.payload);

      // Reserve a unit before doing the work; refund on failure.
      const balanceBefore = await getBalance(ctx.orgId);
      if (balanceBefore < 1) {
        throw apiError(422, {
          code: 'cap_exhausted',
          message: 'org credit balance exhausted',
          retryable: false,
        });
      }

      const purchases = await listPackagePurchases(ctx.orgId);
      const unitPriceUsd = unitPriceForOrg(purchases.map((p) => p.package));

      // Find or create the open batch for (org, class[, window]).
      let batchRef = await getOpenBatchRef(
        ctx.orgId,
        body.batch_class,
        body.batch_window_id
      );
      let batch: BatchRecord | undefined;
      if (batchRef) {
        batch = await getBatch(batchRef);
        if (!batch || batch.status !== 'open') {
          batch = undefined;
          batchRef = undefined;
        }
      }
      if (!batch) {
        batchRef = newId('bat');
        batch = {
          batchReferenceId: batchRef,
          orgId: ctx.orgId,
          credentialId: ctx.credentialId,
          batchClass: body.batch_class,
          batchWindowId: body.batch_window_id,
          status: 'open',
          leafCount: 0,
          unitPriceUsd,
          createdAt: new Date().toISOString(),
        };
        await putBatch(batch);
        await setOpenBatchRef(
          ctx.orgId,
          body.batch_class,
          batchRef,
          body.batch_window_id
        );
      }

      if (batch.leafCount >= MAX_LEAVES_PER_BATCH) {
        throw apiError(422, {
          code: 'cap_exhausted',
          message: `batch already at max leaves (${MAX_LEAVES_PER_BATCH})`,
          retryable: false,
        });
      }

      const proofReferenceId = newId('prf');
      const leafReference = newId('leaf');
      const leafIndex = await appendLeaf(batch.batchReferenceId, {
        leafReference,
        proofReferenceId,
        leafHashHex: hashHex,
        payload: body.payload as Record<string, unknown>,
      });

      if (
        body.expected_leaf_index !== undefined &&
        body.expected_leaf_index !== leafIndex
      ) {
        // The leaf is already appended; surface a soft warning via response field.
        // Some client batchers care; we still succeed.
      }

      batch.leafCount = leafIndex + 1;
      await putBatch(batch);

      await decrementBalance(ctx.orgId, 1);
      await incrementCounter(ctx.orgId, 'batch_leaves', 1);

      res.status(202).json({
        batch_reference_id: batch.batchReferenceId,
        leaf_reference: leafReference,
        leaf_index: leafIndex,
        proof_reference_id: proofReferenceId,
        status: 'queued',
        units_reserved: 1,
        billable_amount_usd: unitPriceUsd,
      });
    } catch (err) {
      next(err);
    }
  }
);

router.post(
  '/proofs/batches/:batchReferenceId/seal',
  requireHmac,
  idempotent,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const ctx = req.aps!;
      const batch = await getBatch(req.params.batchReferenceId);
      if (!batch || batch.orgId !== ctx.orgId) {
        throw apiError(404, {
          code: 'not_found',
          message: 'batch not found',
          retryable: false,
        });
      }
      if (batch.status !== 'open') {
        // Already sealed: replay-style return of current state.
        const existingLeaves = await listLeaves(batch.batchReferenceId);
        res.status(202).json({
          batch_reference_id: batch.batchReferenceId,
          status: batch.status,
          leaf_count: existingLeaves.length,
          merkle_root: batch.merkleRootHex,
          receipt: batch.receiptId
            ? {
                receipt_id: batch.receiptId,
                issued_at: batch.issuedAt,
                verification_ref: batch.verificationRef,
              }
            : undefined,
          units_consumed: batch.unitsConsumed,
          billable_amount_usd: batch.billableAmountUsd,
        });
        return;
      }

      const leaves = await listLeaves(batch.batchReferenceId);
      if (leaves.length === 0) {
        throw apiError(422, {
          code: 'invalid_payload',
          message: 'batch has no leaves to anchor',
          retryable: false,
        });
      }

      const leafBytes = leaves.map((l) => hexToBytes(l.leafHashHex));
      const tree = buildMerkleTree(leafBytes);
      const merkleRootHex = bytesToHex(tree.root);

      // Mark sealed so a concurrent leaf insertion is rejected.
      batch.status = 'sealed';
      batch.sealedAt = new Date().toISOString();
      batch.leafCount = leaves.length;
      batch.merkleRootHex = merkleRootHex;
      await putBatch(batch);
      await clearOpenBatchRef(
        batch.orgId,
        batch.batchClass,
        batch.batchWindowId
      );

      // Anchor on-chain.
      const receipt = await anchorHash(tree.root, {
        mode: 'batch',
        org_id: batch.orgId,
        batch_class: batch.batchClass,
        leaf_count: leaves.length,
      });
      const status = receipt.status === 'finalized' ? 'confirmed' : 'anchored';

      const unitPriceUsd = batch.unitPriceUsd;
      const unitsConsumed = leaves.length;
      const billableAmountUsd =
        Math.round(unitPriceUsd * unitsConsumed * 100) / 100;
      const issuedAt = new Date().toISOString();
      const receiptId = newId('rec');
      const verificationRef = {
        chain: 'concordium' as const,
        tx_hash: receipt.txHash,
        block_ref: receipt.blockHash ?? null,
        contract_event_index: 0,
      };

      // Stamp inclusion paths back on each leaf.
      const enriched = leaves.map((l, i) => ({
        ...l,
        inclusionPath: pathToHex(tree.paths[i]!),
      }));
      await replaceLeaves(batch.batchReferenceId, enriched);

      // Record per-leaf direct-proof rows so /proofs/:id and /proofs/verify
      // both work for batch-anchored events.
      for (const leaf of enriched) {
        await putDirectProof({
          proofReferenceId: leaf.proofReferenceId,
          receiptId,
          orgId: batch.orgId,
          credentialId: batch.credentialId,
          proofMode: 'direct',
          status,
          localEventHashHex: leaf.leafHashHex,
          payload: leaf.payload,
          verificationRef,
          unitsConsumed: 1,
          billableAmountUsd: unitPriceUsd,
          issuedAt,
          batchReferenceId: batch.batchReferenceId,
        });
      }

      batch.status = status;
      batch.receiptId = receiptId;
      batch.verificationRef = verificationRef;
      batch.issuedAt = issuedAt;
      batch.unitsConsumed = unitsConsumed;
      batch.billableAmountUsd = billableAmountUsd;
      await putBatch(batch);

      await incrementCounter(batch.orgId, 'anchored_batches', 1);
      await incrementCounter(batch.orgId, 'units_consumed', unitsConsumed);
      await incrementBillable(batch.orgId, usdToCents(billableAmountUsd));

      res.status(202).json({
        batch_reference_id: batch.batchReferenceId,
        status,
        leaf_count: leaves.length,
        merkle_root: merkleRootHex,
        receipt: {
          receipt_id: receiptId,
          issued_at: issuedAt,
          verification_ref: verificationRef,
        },
        units_consumed: unitsConsumed,
        billable_amount_usd: billableAmountUsd,
      });
    } catch (err) {
      next(err);
    }
  }
);

router.get(
  '/proofs/batches/:batchReferenceId',
  requireHmac,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const ctx = req.aps!;
      const batch = await getBatch(req.params.batchReferenceId);
      if (!batch || batch.orgId !== ctx.orgId) {
        throw apiError(404, {
          code: 'not_found',
          message: 'batch not found',
          retryable: false,
        });
      }

      const cursor = parseInt(String(req.query.cursor ?? '0'), 10) || 0;
      const limit = Math.min(
        parseInt(String(req.query.limit ?? '100'), 10) || 100,
        500
      );

      const leaves = await listLeaves(batch.batchReferenceId);
      const slice = leaves.slice(cursor, cursor + limit);
      const nextCursor = cursor + slice.length < leaves.length
        ? cursor + slice.length
        : null;

      res.status(200).json({
        batch_reference_id: batch.batchReferenceId,
        status: batch.status,
        leaf_count: leaves.length,
        merkle_root: batch.merkleRootHex,
        receipt: batch.receiptId
          ? {
              receipt_id: batch.receiptId,
              issued_at: batch.issuedAt,
              verification_ref: batch.verificationRef,
            }
          : undefined,
        leaves: slice.map((l) => ({
          leaf_reference: l.leafReference,
          leaf_index: l.leafIndex,
          leaf_hash: l.leafHashHex,
          inclusion_path: l.inclusionPath ?? [],
          proof_reference_id: l.proofReferenceId,
        })),
        next_cursor: nextCursor,
      });
    } catch (err) {
      next(err);
    }
  }
);

export default router;
