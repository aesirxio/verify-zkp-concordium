import cbor from 'cbor';

/**
 * CCDPRA — Concordium Proof Receipt Anchor.
 *
 * A small CBOR envelope used by the AesirX Proof Service to anchor non-wallet
 * proofs (scanner direct, IAT direct events, IAT batch Merkle roots) on-chain
 * via a RegisterData transaction. Mirrors the shape of CCDVRA / CCDVAA used by
 * the wallet-flow anchors (see @concordium/web-sdk VerificationRequestV1.Anchor)
 * so that future readers can route by `type` tag.
 *
 * On-chain payload: cbor({ type, version, hash, public? }) where `hash` is a
 * 32-byte SHA-256 of the canonical proof payload (direct mode) or the Merkle
 * root over leaf hashes (batch mode).
 */

export const CCDPRA_TYPE = 'CCDPRA' as const;
export const CCDPRA_VERSION = 1 as const;

export interface CcdpraAnchor {
  type: typeof CCDPRA_TYPE;
  version: typeof CCDPRA_VERSION;
  hash: Uint8Array;
  public?: Record<string, unknown>;
}

export const encodeAnchor = (input: {
  hash: Uint8Array;
  public?: Record<string, unknown>;
}): Uint8Array => {
  if (input.hash.length !== 32) {
    throw new Error(
      `CCDPRA hash must be 32 bytes (SHA-256), got ${input.hash.length}`
    );
  }
  const map: Record<string, unknown> = {
    type: CCDPRA_TYPE,
    version: CCDPRA_VERSION,
    hash: Buffer.from(input.hash),
  };
  if (input.public !== undefined) {
    map.public = input.public;
  }
  return new Uint8Array(cbor.encode(map));
};

export const decodeAnchor = (data: Uint8Array): CcdpraAnchor => {
  const value = cbor.decodeFirstSync(Buffer.from(data));
  if (typeof value !== 'object' || value === null) {
    throw new Error('CCDPRA: expected a CBOR-encoded object');
  }
  const v = value as Record<string, unknown>;
  if (v.type !== CCDPRA_TYPE) {
    throw new Error(`CCDPRA: expected type "${CCDPRA_TYPE}", got "${String(v.type)}"`);
  }
  if (v.version !== CCDPRA_VERSION) {
    throw new Error(
      `CCDPRA: expected version ${CCDPRA_VERSION}, got ${String(v.version)}`
    );
  }
  const hash = v.hash;
  if (!(hash instanceof Uint8Array || Buffer.isBuffer(hash))) {
    throw new Error('CCDPRA: "hash" must be a byte string');
  }
  const hashBytes = hash instanceof Uint8Array ? hash : new Uint8Array(hash as Buffer);
  if (hashBytes.length !== 32) {
    throw new Error(
      `CCDPRA: "hash" must be 32 bytes, got ${hashBytes.length}`
    );
  }
  if ('public' in v && (typeof v.public !== 'object' || v.public === null)) {
    throw new Error('CCDPRA: "public" must be an object when present');
  }
  return {
    type: CCDPRA_TYPE,
    version: CCDPRA_VERSION,
    hash: hashBytes,
    public: (v.public as Record<string, unknown> | undefined) ?? undefined,
  };
};
