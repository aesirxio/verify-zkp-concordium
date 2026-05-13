import { Router, type Request, type Response, type NextFunction } from 'express';

import { ALLOW_SELF_REDEEM, CREDIT_PACKAGES } from '../config.js';
import { requireHmac } from '../middleware/auth.js';
import { idempotent } from '../middleware/idempotency.js';
import { apiError } from '../middleware/errors.js';
import {
  findPackage,
  getBalance,
  getTotals,
  incrementBalance,
  listPackagePurchases,
  recordPackagePurchase,
} from '../storage/usage.js';

const router = Router();

router.get(
  '/usage/orgs/:orgId',
  requireHmac,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const ctx = req.aps!;
      if (req.params.orgId !== ctx.orgId) {
        throw apiError(403, {
          code: 'org_mismatch',
          message: 'org id mismatch',
          retryable: false,
        });
      }
      const [balance, totals, packages] = await Promise.all([
        getBalance(ctx.orgId),
        getTotals(ctx.orgId),
        listPackagePurchases(ctx.orgId),
      ]);
      res.status(200).json({
        org_id: ctx.orgId,
        credit_balance: balance,
        period_start: null,
        period_end: null,
        totals,
        package_history: packages.map((p) => ({
          purchased_at: p.purchasedAt,
          package: p.package,
          units: p.units,
          price_usd: p.priceUsd,
        })),
        price_card: CREDIT_PACKAGES,
      });
    } catch (err) {
      next(err);
    }
  }
);

router.post(
  '/usage/orgs/:orgId/credit-packages',
  requireHmac,
  idempotent,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!ALLOW_SELF_REDEEM) {
        throw apiError(403, {
          code: 'self_redeem_disabled',
          message:
            'credit packages must be granted by an operator (see scripts/grant-credits)',
          retryable: false,
        });
      }
      const ctx = req.aps!;
      if (req.params.orgId !== ctx.orgId) {
        throw apiError(403, {
          code: 'org_mismatch',
          message: 'org id mismatch',
          retryable: false,
        });
      }
      const body = (req.body ?? {}) as {
        package?: string;
        units?: number;
        price_paid_usd?: number;
        external_invoice_id?: string;
      };

      const pkg = findPackage(body.package ?? '');
      if (!pkg) {
        throw apiError(400, {
          code: 'invalid_payload',
          message: 'unknown package code',
          retryable: false,
        });
      }
      if (
        body.units !== pkg.units ||
        Math.abs((body.price_paid_usd ?? -1) - pkg.priceUsd) > 0.005
      ) {
        throw apiError(400, {
          code: 'invalid_payload',
          message: 'package, units, and price must match the published card',
          retryable: false,
        });
      }
      if (typeof body.external_invoice_id !== 'string' || !body.external_invoice_id) {
        throw apiError(400, {
          code: 'invalid_payload',
          message: '"external_invoice_id" required',
          retryable: false,
        });
      }

      const purchase = {
        purchasedAt: new Date().toISOString(),
        package: pkg.package,
        units: pkg.units,
        priceUsd: pkg.priceUsd,
        externalInvoiceId: body.external_invoice_id,
      };
      await recordPackagePurchase(ctx.orgId, purchase);
      const newBalance = await incrementBalance(ctx.orgId, pkg.units);

      res.status(201).json({
        org_id: ctx.orgId,
        package: pkg.package,
        units_added: pkg.units,
        price_paid_usd: pkg.priceUsd,
        external_invoice_id: body.external_invoice_id,
        credit_balance_after: newBalance,
      });
    } catch (err) {
      next(err);
    }
  }
);

export default router;
