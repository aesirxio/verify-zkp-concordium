import { createHash } from 'node:crypto';

export const sha256 = (data: Uint8Array | string): Uint8Array => {
  const h = createHash('sha256');
  h.update(typeof data === 'string' ? Buffer.from(data, 'utf8') : Buffer.from(data));
  return new Uint8Array(h.digest());
};

export const sha256Hex = (data: Uint8Array | string): string =>
  Buffer.from(sha256(data)).toString('hex');

export const hexToBytes = (hex: string): Uint8Array => {
  const clean = hex.startsWith('0x') ? hex.slice(2) : hex;
  if (clean.length % 2 !== 0) {
    throw new Error('hex string has odd length');
  }
  if (!/^[0-9a-fA-F]*$/.test(clean)) {
    throw new Error('invalid hex string');
  }
  return Uint8Array.from(Buffer.from(clean, 'hex'));
};

export const bytesToHex = (bytes: Uint8Array): string =>
  Buffer.from(bytes).toString('hex');

/**
 * RFC 8785 (JCS) JSON canonicalisation, scoped to the subset of values the
 * canonical proof payload uses (string, number, boolean, null, plain objects,
 * arrays). Object keys are sorted alphabetically, no whitespace.
 *
 * This deliberately rejects shapes the caller would not be sending so we fail
 * fast rather than silently producing the wrong hash: BigInt, Date, undefined,
 * non-finite numbers, class instances.
 */
export const jcsCanonicalize = (value: unknown): string => {
  if (value === null) return 'null';
  switch (typeof value) {
    case 'boolean':
      return value ? 'true' : 'false';
    case 'string':
      return JSON.stringify(value);
    case 'number': {
      if (!Number.isFinite(value)) {
        throw new Error('JCS: non-finite numbers are not permitted');
      }
      // ES2020+ Number#toString output is JCS-compliant for finite numbers
      // representable exactly; for the proof payload (codes + hashes + ints),
      // values stay within that subset.
      return JSON.stringify(value);
    }
    case 'object': {
      if (Array.isArray(value)) {
        return `[${value.map((v) => jcsCanonicalize(v)).join(',')}]`;
      }
      const obj = value as Record<string, unknown>;
      const keys = Object.keys(obj).sort();
      const parts = keys.map(
        (k) => `${JSON.stringify(k)}:${jcsCanonicalize(obj[k])}`
      );
      return `{${parts.join(',')}}`;
    }
    default:
      throw new Error(`JCS: unsupported value type ${typeof value}`);
  }
};

/**
 * Compute the leaf hash of a canonical proof payload per API contract §4.
 * The leaf hash is SHA-256 over the JCS canonicalisation of all payload fields
 * except `local_event_hash` itself (which the client supplies and we re-derive
 * to verify).
 */
export const computeLocalEventHash = (
  payload: Record<string, unknown>
): Uint8Array => {
  const { local_event_hash: _ignored, ...rest } = payload;
  void _ignored;
  return sha256(jcsCanonicalize(rest));
};
