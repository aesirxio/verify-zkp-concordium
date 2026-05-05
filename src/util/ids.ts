import { randomBytes } from 'node:crypto';

/** Short opaque id with a short prefix, e.g. `prf_5f3a...`. */
export const newId = (prefix: string): string =>
  `${prefix}_${randomBytes(12).toString('hex')}`;
