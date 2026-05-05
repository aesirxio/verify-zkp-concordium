import { CREDIT_PACKAGES, type CreditPackage } from '../config.js';
import { getRedis, k } from './redis.js';

const balanceKey = (orgId: string) => k('usage', orgId, 'balance');
const totalsKey = (orgId: string) => k('usage', orgId, 'totals');
const packagesKey = (orgId: string) => k('usage', orgId, 'packages');

export type UsageCounter =
  | 'direct_proofs'
  | 'batch_leaves'
  | 'anchored_batches'
  | 'units_consumed';

export const incrementCounter = async (
  orgId: string,
  counter: UsageCounter,
  by: number
): Promise<void> => {
  await getRedis().hincrby(totalsKey(orgId), counter, by);
};

export const incrementBillable = async (
  orgId: string,
  cents: number
): Promise<void> => {
  await getRedis().hincrby(totalsKey(orgId), 'billable_cents', cents);
};

export const getTotals = async (
  orgId: string
): Promise<{
  direct_proofs: number;
  batch_leaves: number;
  anchored_batches: number;
  units_consumed: number;
  billable_amount_usd: number;
}> => {
  const h = await getRedis().hgetall(totalsKey(orgId));
  const num = (k2: string) => parseInt(h[k2] || '0', 10);
  return {
    direct_proofs: num('direct_proofs'),
    batch_leaves: num('batch_leaves'),
    anchored_batches: num('anchored_batches'),
    units_consumed: num('units_consumed'),
    billable_amount_usd: num('billable_cents') / 100,
  };
};

export const decrementBalance = async (
  orgId: string,
  units: number
): Promise<number> => {
  const after = await getRedis().decrby(balanceKey(orgId), units);
  return after;
};

export const incrementBalance = async (
  orgId: string,
  units: number
): Promise<number> => {
  const after = await getRedis().incrby(balanceKey(orgId), units);
  return after;
};

export const getBalance = async (orgId: string): Promise<number> => {
  const v = await getRedis().get(balanceKey(orgId));
  return v ? parseInt(v, 10) : 0;
};

export interface PackagePurchase {
  purchasedAt: string;
  package: CreditPackage['package'];
  units: number;
  priceUsd: number;
  externalInvoiceId: string;
}

export const recordPackagePurchase = async (
  orgId: string,
  purchase: PackagePurchase
): Promise<void> => {
  await getRedis().rpush(packagesKey(orgId), JSON.stringify(purchase));
};

export const listPackagePurchases = async (
  orgId: string
): Promise<PackagePurchase[]> => {
  const items = await getRedis().lrange(packagesKey(orgId), 0, -1);
  return items.map((s) => JSON.parse(s) as PackagePurchase);
};

export const findPackage = (
  pkg: string
): CreditPackage | undefined =>
  CREDIT_PACKAGES.find((p) => p.package === pkg);
