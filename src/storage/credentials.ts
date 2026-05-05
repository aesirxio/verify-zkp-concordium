import { getRedis, k } from './redis.js';

export interface Credential {
  credentialId: string;
  orgId: string;
  /** HMAC-SHA256 signing secret (raw, base64, or hex — caller-defined). */
  secret: string;
  createdAt: string;
  revokedAt?: string;
}

const credKey = (credentialId: string) => k('cred', credentialId);

export const putCredential = async (cred: Credential): Promise<void> => {
  await getRedis().set(credKey(cred.credentialId), JSON.stringify(cred));
};

export const getCredential = async (
  credentialId: string
): Promise<Credential | undefined> => {
  const raw = await getRedis().get(credKey(credentialId));
  if (!raw) return undefined;
  return JSON.parse(raw) as Credential;
};

export const revokeCredential = async (credentialId: string): Promise<void> => {
  const cur = await getCredential(credentialId);
  if (!cur) return;
  cur.revokedAt = new Date().toISOString();
  await putCredential(cur);
};
