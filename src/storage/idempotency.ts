import { IDEMPOTENCY_TTL_SEC } from '../config.js';
import { getRedis, k } from './redis.js';

export interface IdempotencyRecord {
  /** SHA-256 of the request body bytes — used to detect "same key, different body". */
  bodyHashHex: string;
  status: number;
  responseBody: string;
  storedAt: string;
}

const key = (credentialId: string, idempotencyKey: string) =>
  k('idem', credentialId, idempotencyKey);

export const getIdempotency = async (
  credentialId: string,
  idempotencyKey: string
): Promise<IdempotencyRecord | undefined> => {
  const raw = await getRedis().get(key(credentialId, idempotencyKey));
  return raw ? (JSON.parse(raw) as IdempotencyRecord) : undefined;
};

export const setIdempotency = async (
  credentialId: string,
  idempotencyKey: string,
  rec: IdempotencyRecord
): Promise<void> => {
  await getRedis().set(
    key(credentialId, idempotencyKey),
    JSON.stringify(rec),
    'EX',
    IDEMPOTENCY_TTL_SEC
  );
};
