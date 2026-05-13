/**
 * Manually revoke a credit package from an org (clawback / correction).
 * Mirrors grant-credits but decrements the balance.
 *
 * Usage (dev):
 *   tsx src/scripts/revoke-credits.ts --org <ORG_ID> --package <starter|growth|enterprise> [--note "..."]
 *
 * Usage (prod, inside container):
 *   docker compose exec api node dist/scripts/revoke-credits.js \
 *     --org <ORG_ID> --package <starter|growth|enterprise> [--note "..."]
 *
 * Balance can go negative — Redis DECRBY does not clamp. The CLI prints a
 * warning if the resulting balance is below zero so the operator notices.
 */
import { CREDIT_PACKAGES } from '../config.js';
import { newId } from '../util/ids.js';
import { getRedis } from '../storage/redis.js';
import {
  decrementBalance,
  findPackage,
  getBalance,
  recordPackagePurchase,
} from '../storage/usage.js';

const parseArgs = (): Record<string, string | boolean> => {
  const out: Record<string, string | boolean> = {};
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const key = a.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith('--')) {
      out[key] = true;
    } else {
      out[key] = next;
      i++;
    }
  }
  return out;
};

const usage = (): never => {
  console.error(
    'usage: revoke-credits --org <ORG_ID> --package <starter|growth|enterprise> [--note "..."]'
  );
  console.error('');
  console.error('available packages:');
  for (const p of CREDIT_PACKAGES) {
    console.error(`  ${p.package.padEnd(12)} ${p.units.toLocaleString()} units  ($${p.priceUsd})`);
  }
  process.exit(1);
};

const main = async (): Promise<void> => {
  const args = parseArgs();
  const orgId = args.org as string | undefined;
  const packageCode = args.package as string | undefined;
  const note = (args.note as string | undefined) ?? '';

  if (!orgId || !packageCode) usage();

  const pkg = findPackage(packageCode!);
  if (!pkg) {
    console.error(`error: unknown package "${packageCode}"`);
    usage();
  }

  const before = await getBalance(orgId!);
  const revokeId = newId('revoke');
  const revokedAt = new Date().toISOString();

  // Record as a purchase row with negative units so the package_history
  // reflects the clawback. The price is recorded as 0 because no refund
  // actually moved through a payment processor in demo mode.
  await recordPackagePurchase(orgId!, {
    purchasedAt: revokedAt,
    package: pkg!.package,
    units: -pkg!.units,
    priceUsd: 0,
    externalInvoiceId: `revoke:${revokeId}${note ? `:${note.replace(/\s+/g, '_')}` : ''}`,
  });
  const after = await decrementBalance(orgId!, pkg!.units);

  console.log('Credit package revoked.');
  console.log('');
  console.log(`  org_id          : ${orgId}`);
  console.log(`  package         : ${pkg!.package}`);
  console.log(`  units_removed   : ${pkg!.units.toLocaleString()}`);
  console.log(`  balance_before  : ${before.toLocaleString()}`);
  console.log(`  balance_after   : ${after.toLocaleString()}`);
  console.log(`  revoke_id       : ${revokeId}`);
  console.log(`  revoked_at      : ${revokedAt}`);
  if (note) console.log(`  note            : ${note}`);
  if (after < 0) {
    console.log('');
    console.log(`WARNING: balance is negative (${after}). Next proof submission will fail.`);
  }

  await getRedis().quit();
};

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
