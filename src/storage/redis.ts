import IORedis, { type Redis } from 'ioredis';

import { REDIS_KEY_PREFIX, REDIS_URL } from '../config.js';

let cached: Redis | undefined;

export const getRedis = (): Redis => {
  if (!cached) {
    cached = new IORedis(REDIS_URL, {
      lazyConnect: false,
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
    });
  }
  return cached;
};

export const k = (...parts: (string | number)[]): string =>
  [REDIS_KEY_PREFIX, ...parts].join(':');
