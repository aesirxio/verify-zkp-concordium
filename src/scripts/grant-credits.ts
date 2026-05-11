/**
 * Manually grant a credit package to an org. Used during demo / pre-billing
 * operations when there is no Stripe / payment flow yet.
 *
 * Usage (dev):
 *   tsx src/scripts/grant-credits.ts --org <ORG_ID> --package <starter|growth|enterprise> [--note "..."]
 *
 * Usage (prod, inside container):
 *   docker compose exec api node dist/scripts/grant-credits.js \
 *     --org <ORG_ID> --package <starter|growth|enterprise> [--note "..."]
 */
import { CREDIT_PACKAGES } from '../config.js';
import { newId } from '../util/ids.js';
import { getRedis } from '../storage/redis.js';
import {
  findPackage,
  getBalance,
  incrementBalance,
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
    'usage: grant-credits --org <ORG_ID> --package <starter|growth|enterprise> [--note "..."]'
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
  const grantId = newId('grant');
  const purchasedAt = new Date().toISOString();

  await recordPackagePurchase(orgId!, {
    purchasedAt,
    package: pkg!.package,
    units: pkg!.units,
    priceUsd: pkg!.priceUsd,
    externalInvoiceId: `manual:${grantId}${note ? `:${note.replace(/\s+/g, '_')}` : ''}`,
  });
  const after = await incrementBalance(orgId!, pkg!.units);

  console.log('Credit package granted.');
  console.log('');
  console.log(`  org_id          : ${orgId}`);
  console.log(`  package         : ${pkg!.package}`);
  console.log(`  units_added     : ${pkg!.units.toLocaleString()}`);
  console.log(`  balance_before  : ${before.toLocaleString()}`);
  console.log(`  balance_after   : ${after.toLocaleString()}`);
  console.log(`  grant_id        : ${grantId}`);
  console.log(`  purchased_at    : ${purchasedAt}`);
  if (note) console.log(`  note            : ${note}`);

  await getRedis().quit();
};

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
