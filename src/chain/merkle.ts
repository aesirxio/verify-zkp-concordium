import { sha256, bytesToHex } from './hash.js';

/**
 * Hash a sorted pair of 32-byte digests, smaller-first, and return the parent
 * node. Sorted-pair hashing makes inclusion paths order-independent: the
 * verifier simply rehashes `sort([acc, sibling])` at each level.
 */
export const hashPair = (a: Uint8Array, b: Uint8Array): Uint8Array => {
  const cmp = Buffer.compare(Buffer.from(a), Buffer.from(b));
  const [first, second] = cmp <= 0 ? [a, b] : [b, a];
  const buf = Buffer.concat([Buffer.from(first), Buffer.from(second)]);
  return sha256(buf);
};

export interface MerkleTree {
  root: Uint8Array;
  /** Per-leaf inclusion path (sibling at each level, root excluded). */
  paths: Uint8Array[][];
  /** Original leaves, retained for reference. */
  leaves: Uint8Array[];
}

/**
 * Build a SHA-256 Merkle tree over the given leaves with sorted-pair hashing
 * and **no padding**: a level with an odd count promotes the trailing node
 * unchanged. A single leaf is its own root. Empty input is rejected.
 */
export const buildMerkleTree = (leaves: Uint8Array[]): MerkleTree => {
  if (leaves.length === 0) {
    throw new Error('buildMerkleTree: at least one leaf is required');
  }
  for (const l of leaves) {
    if (l.length !== 32) {
      throw new Error(`buildMerkleTree: each leaf must be 32 bytes, got ${l.length}`);
    }
  }
  if (leaves.length === 1) {
    return { root: leaves[0]!, paths: [[]], leaves };
  }

  // levels[0] = leaves; build up
  const levels: Uint8Array[][] = [leaves.slice()];
  while (levels[levels.length - 1]!.length > 1) {
    const cur = levels[levels.length - 1]!;
    const next: Uint8Array[] = [];
    for (let i = 0; i < cur.length; i += 2) {
      if (i + 1 < cur.length) {
        next.push(hashPair(cur[i]!, cur[i + 1]!));
      } else {
        next.push(cur[i]!); // promote unpaired node
      }
    }
    levels.push(next);
  }

  const root = levels[levels.length - 1]![0]!;
  const paths: Uint8Array[][] = leaves.map((_, leafIdx) => {
    const path: Uint8Array[] = [];
    let idx = leafIdx;
    for (let lvl = 0; lvl < levels.length - 1; lvl += 1) {
      const cur = levels[lvl]!;
      const siblingIdx = idx ^ 1;
      if (siblingIdx < cur.length) {
        path.push(cur[siblingIdx]!);
      }
      // else: this node was promoted unchanged — no sibling at this level
      idx = Math.floor(idx / 2);
    }
    return path;
  });

  return { root, paths, leaves };
};

/**
 * Verify an inclusion proof: rehash leaf with each sibling using sorted-pair
 * hashing and compare to the expected root.
 */
export const verifyMerkleProof = (
  leaf: Uint8Array,
  path: Uint8Array[],
  root: Uint8Array
): boolean => {
  let acc = leaf;
  for (const sibling of path) {
    acc = hashPair(acc, sibling);
  }
  return Buffer.compare(Buffer.from(acc), Buffer.from(root)) === 0;
};

export const pathToHex = (path: Uint8Array[]): string[] =>
  path.map((node) => bytesToHex(node));
