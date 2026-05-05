/**
 * Seed (or rotate) an HMAC credential for the AesirX Proof Service.
 *
 * Usage (dev):
 *   tsx src/scripts/seed-credential.ts --org <ORG_ID> [--cred <CRED_ID>] [--secret <HEX>] [--rotate]
 *
 * Usage (prod, inside container):
 *   node dist/scripts/seed-credential.js --org <ORG_ID> [...]
 *
 * Env (same as the service):
 *   REDIS_URL              default redis://localhost:6379
 *   REDIS_KEY_PREFIX       default aps
 */
import * as crypto from 'node:crypto';

import { getRedis } from '../storage/redis.js';
import { getCredential, putCredential } from '../storage/credentials.js';

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

const main = async (): Promise<void> => {
  const args = parseArgs();
  const orgId = args.org as string | undefined;
  if (!orgId) {
    console.error('error: --org <ORG_ID> is required');
    process.exit(1);
  }

  const credentialId =
    (args.cred as string | undefined) ||
    `cred_${orgId.replace(/[^a-zA-Z0-9_-]/g, '_')}_${Date.now()}`;
  const rotate = Boolean(args.rotate);
  const explicitSecret = args.secret as string | undefined;

  const existing = await getCredential(credentialId);
  if (existing && !rotate) {
    console.error(
      `error: credential "${credentialId}" already exists. Pass --rotate to overwrite the secret.`
    );
    process.exit(2);
  }

  const secret = explicitSecret || crypto.randomBytes(32).toString('hex');
  await putCredential({
    credentialId,
    orgId,
    secret,
    createdAt: new Date().toISOString(),
  });

  console.log('Credential seeded.');
  console.log('');
  console.log('Add these to the calling service env (e.g. web3-id-backend api/.env):');
  console.log(`AESIRX_PROOF_ORG_ID=${orgId}`);
  console.log(`AESIRX_PROOF_CREDENTIAL_ID=${credentialId}`);
  console.log(`AESIRX_PROOF_SECRET=${secret}`);

  await getRedis().quit();
};

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
