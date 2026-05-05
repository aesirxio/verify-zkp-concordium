import { Router, type Request, type Response, type NextFunction } from 'express';

import { anchorHash } from '../chain/anchor.js';
import { hexToBytes } from '../chain/hash.js';
import { requireHmac } from '../middleware/auth.js';
import { idempotent } from '../middleware/idempotency.js';
import { apiError } from '../middleware/errors.js';
import { validateAndHashPayload } from '../proofs/payload.js';
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
import { getDirectProof } from '../storage/proofs.js';

const router = Router();

router.post(
  '/proofs/events',
  requireHmac,
  idempotent,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const ctx = req.aps!;
      const body = (req.body ?? {}) as { payload?: unknown };
      const { hashHex, hash } = validateAndHashPayload(body.payload);

      const balance = await getBalance(ctx.orgId);
      if (balance < 1) {
        throw apiError(422, {
          code: 'cap_exhausted',
          message: 'org credit balance exhausted',
          retryable: false,
        });
      }

      const purchases = await listPackagePurchases(ctx.orgId);
      const unitPriceUsd = unitPriceForOrg(purchases.map((p) => p.package));

      const receipt = await anchorHash(hash, {
        mode: 'direct',
        org_id: ctx.orgId,
        leaf_hash_hex: hashHex,
      });

      const proofReferenceId = newId('prf');
      const receiptId = newId('rec');
      const issuedAt = new Date().toISOString();
      const status = receipt.status === 'finalized' ? 'confirmed' : 'anchored';

      const balanceAfter = await decrementBalance(ctx.orgId, 1);
      await incrementCounter(ctx.orgId, 'direct_proofs', 1);
      await incrementCounter(ctx.orgId, 'units_consumed', 1);
      await incrementBillable(ctx.orgId, usdToCents(unitPriceUsd));

      const verificationRef = {
        chain: 'concordium' as const,
        tx_hash: receipt.txHash,
        block_ref: receipt.blockHash ?? null,
        contract_event_index: 0,
      };

      await putDirectProof({
        proofReferenceId,
        receiptId,
        orgId: ctx.orgId,
        credentialId: ctx.credentialId,
        proofMode: 'direct',
        status,
        localEventHashHex: hashHex,
        payload: body.payload as Record<string, unknown>,
        verificationRef,
        unitsConsumed: 1,
        billableAmountUsd: unitPriceUsd,
        issuedAt,
      });

      // Touch hash to silence unused-var warning when we later add chain
      // re-derivation; left explicit for clarity.
      void hexToBytes;

      res.status(202).json({
        proof_reference_id: proofReferenceId,
        proof_mode: 'direct',
        status,
        receipt: {
          receipt_id: receiptId,
          issued_at: issuedAt,
          verification_ref: verificationRef,
        },
        units_consumed: 1,
        billable_amount_usd: unitPriceUsd,
        credit_balance_after: balanceAfter,
      });
    } catch (err) {
      next(err);
    }
  }
);

router.get(
  '/proofs/:proofReferenceId',
  requireHmac,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const ctx = req.aps!;
      const rec = await getDirectProof(req.params.proofReferenceId);
      if (!rec || rec.orgId !== ctx.orgId) {
        throw apiError(404, {
          code: 'not_found',
          message: 'proof not found',
          retryable: false,
        });
      }
      res.status(200).json({
        proof_reference_id: rec.proofReferenceId,
        proof_mode: rec.proofMode,
        status: rec.status,
        receipt: {
          receipt_id: rec.receiptId,
          issued_at: rec.issuedAt,
          verification_ref: rec.verificationRef,
        },
        units_consumed: rec.unitsConsumed,
        billable_amount_usd: rec.billableAmountUsd,
      });
    } catch (err) {
      next(err);
    }
  }
);

export default router;
