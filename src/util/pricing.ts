import {
  CREDIT_PACKAGES,
  DEFAULT_UNIT_PRICE_USD,
  type CreditPackage,
} from '../config.js';

/**
 * Pick the per-unit price for an org based on the largest package they have
 * purchased. v1 is naive: callers can later swap this for a per-org override.
 */
export const unitPriceForOrg = (purchasedPackages: string[]): number => {
  if (purchasedPackages.includes('enterprise')) return tierPrice('enterprise');
  if (purchasedPackages.includes('growth')) return tierPrice('growth');
  if (purchasedPackages.includes('starter')) return tierPrice('starter');
  return DEFAULT_UNIT_PRICE_USD;
};

const tierPrice = (tier: CreditPackage['package']): number => {
  const p = CREDIT_PACKAGES.find((x) => x.package === tier);
  return p ? p.unitPriceUsd : DEFAULT_UNIT_PRICE_USD;
};

export const usdToCents = (usd: number): number => Math.round(usd * 100);
