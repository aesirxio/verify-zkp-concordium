import { Router, type Request, type Response, type NextFunction } from 'express';

import { requireHmac } from '../middleware/auth.js';
import { apiError } from '../middleware/errors.js';
import { getDirectProof } from '../storage/proofs.js';

const router = Router();

router.post(
  '/proofs/verify',
  requireHmac,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const ctx = req.aps!;
      const items = (req.body?.items ?? []) as Array<{
        proof_reference_id?: string;
        local_event_hash?: string;
      }>;
      if (!Array.isArray(items)) {
        throw apiError(400, {
          code: 'invalid_payload',
          message: '"items" must be an array',
          retryable: false,
        });
      }

      const checkedAt = new Date().toISOString();
      const results = await Promise.all(
        items.map(async (item) => {
          if (!item.proof_reference_id || !item.local_event_hash) {
            return {
              proof_reference_id: item.proof_reference_id,
              verification_status: 'not_found' as const,
              verification_ref: null,
              checked_at: checkedAt,
            };
          }
          const rec = await getDirectProof(item.proof_reference_id);
          if (!rec || rec.orgId !== ctx.orgId) {
            return {
              proof_reference_id: item.proof_reference_id,
              verification_status: 'not_found' as const,
              verification_ref: null,
              checked_at: checkedAt,
            };
          }
          if (rec.localEventHashHex !== item.local_event_hash) {
            return {
              proof_reference_id: item.proof_reference_id,
              verification_status: 'hash_mismatch' as const,
              verification_ref: rec.verificationRef,
              checked_at: checkedAt,
            };
          }
          return {
            proof_reference_id: item.proof_reference_id,
            verification_status: 'verified' as const,
            verification_ref: rec.verificationRef,
            checked_at: checkedAt,
          };
        })
      );

      res.status(200).json({ results });
    } catch (err) {
      next(err);
    }
  }
);

export default router;
