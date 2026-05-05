import { computeLocalEventHash, sha256Hex } from '../chain/hash.js';
import { apiError } from '../middleware/errors.js';

const SENSITIVITY = new Set([
  'public',
  'internal',
  'sensitive',
  'restricted',
]);

const HEX64 = /^[0-9a-f]{64}$/;
const ISO_DATE =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

const REQUIRED_HASH_FIELDS = [
  'object_id_hash',
  'actor_context_hash',
  'delta_summary_hash',
] as const;
const REQUIRED_STRING_FIELDS = [
  'org_id',
  'module',
  'event_type',
  'object_type',
  'action',
] as const;

/** Max canonical payload size, per contract §4.2. */
const MAX_PAYLOAD_BYTES = 4 * 1024;

const fail = (msg: string): never => {
  throw apiError(400, {
    code: 'invalid_payload',
    message: msg,
    retryable: false,
  });
};

/**
 * Validate a v1 canonical proof payload and return the recomputed local event
 * hash (raw bytes + hex). The recomputed hash MUST match `payload.local_event_hash`
 * — clients are responsible for providing the right value, and the server
 * re-derives it as both a sanity check and the leaf input for anchoring.
 */
export const validateAndHashPayload = (
  raw: unknown
): { hashHex: string; hash: Uint8Array } => {
  if (typeof raw !== 'object' || raw === null) {
    return fail('payload must be an object');
  }
  const payload = raw as Record<string, unknown>;

  const sizeBytes = Buffer.byteLength(JSON.stringify(payload), 'utf8');
  if (sizeBytes > MAX_PAYLOAD_BYTES) {
    return fail(`payload exceeds ${MAX_PAYLOAD_BYTES} bytes`);
  }

  if (payload.schema_version !== 'v1') {
    return fail('schema_version must be "v1"');
  }

  for (const f of REQUIRED_STRING_FIELDS) {
    if (typeof payload[f] !== 'string' || !(payload[f] as string).length) {
      return fail(`missing or invalid "${f}"`);
    }
  }

  if (
    payload.group_org_id !== null &&
    typeof payload.group_org_id !== 'string'
  ) {
    return fail('"group_org_id" must be a string or null');
  }

  if (
    typeof payload.occurred_at !== 'string' ||
    !ISO_DATE.test(payload.occurred_at)
  ) {
    return fail('"occurred_at" must be RFC 3339');
  }

  for (const f of REQUIRED_HASH_FIELDS) {
    if (typeof payload[f] !== 'string' || !HEX64.test(payload[f] as string)) {
      return fail(`"${f}" must be sha256 hex (64 chars)`);
    }
  }

  if (
    typeof payload.sensitivity_level !== 'string' ||
    !SENSITIVITY.has(payload.sensitivity_level)
  ) {
    return fail('"sensitivity_level" must be one of public|internal|sensitive|restricted');
  }

  if (
    typeof payload.local_event_hash !== 'string' ||
    !HEX64.test(payload.local_event_hash)
  ) {
    return fail('"local_event_hash" must be sha256 hex (64 chars)');
  }

  const recomputed = computeLocalEventHash(payload);
  const recomputedHex = Buffer.from(recomputed).toString('hex');
  if (recomputedHex !== payload.local_event_hash) {
    return fail('local_event_hash does not match canonical payload');
  }

  return { hashHex: recomputedHex, hash: recomputed };
};

/** Public re-export so routes can hash bytes without pulling chain/hash directly. */
export { sha256Hex };
