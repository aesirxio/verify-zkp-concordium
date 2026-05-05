export type ConcordiumNetwork = 'testnet' | 'mainnet';

const TRUSTED_ISSUERS: Record<ConcordiumNetwork, string[]> = {
  testnet: [
    'did:ccd:testnet:idp:0',
    'did:ccd:testnet:idp:1',
    'did:ccd:testnet:idp:2',
    'did:ccd:testnet:idp:3',
  ],
  mainnet: [
    'did:ccd:mainnet:idp:0',
    'did:ccd:mainnet:idp:1',
    'did:ccd:mainnet:idp:2',
    'did:ccd:mainnet:idp:3',
  ],
};

export const PORT = parseInt(process.env.PORT || '8084', 10);
export const NODE_ENV = process.env.NODE_ENV || 'development';

export const CORS_ORIGINS = (process.env.CORS_ORIGINS || '*')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

export const VERIFIER_SERVICE_URL =
  process.env.VERIFIER_SERVICE_URL || 'http://localhost:8000';

export const NETWORK: ConcordiumNetwork =
  process.env.CONCORDIUM_NETWORK === 'mainnet' ? 'mainnet' : 'testnet';

export const ISSUERS = TRUSTED_ISSUERS[NETWORK];

export const DEFAULT_CONTEXT_STRING =
  process.env.DEFAULT_CONTEXT_STRING ||
  'Age and country verification for site access';

export const DEFAULT_RESOURCE_ID = process.env.DEFAULT_RESOURCE_ID || '/';

export const SESSION_TTL_MS =
  parseInt(process.env.VERIFICATION_SESSION_TTL || '300', 10) * 1000;

// --- AesirX Proof Service (Phase 1+2) ---

export const CONCORDIUM_NODE_HOST =
  process.env.CONCORDIUM_NODE_HOST || 'grpc.testnet.concordium.com';
export const CONCORDIUM_NODE_PORT = parseInt(
  process.env.CONCORDIUM_NODE_PORT || '20000',
  10
);
export const CONCORDIUM_NODE_TLS =
  (process.env.CONCORDIUM_NODE_TLS || 'true').toLowerCase() !== 'false';

// AesirX-owned funded account on Concordium that submits the on-chain anchors.
export const AESIRX_ACCOUNT_ADDRESS = process.env.AESIRX_ACCOUNT_ADDRESS || '';
export const AESIRX_PRIVATE_KEY = process.env.AESIRX_PRIVATE_KEY || '';

export const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
export const REDIS_KEY_PREFIX = process.env.REDIS_KEY_PREFIX || 'aps';

// Anchor finalization wait timeout per submission.
export const ANCHOR_FINALITY_TIMEOUT_MS = parseInt(
  process.env.ANCHOR_FINALITY_TIMEOUT_MS || '60000',
  10
);

// HMAC replay window in seconds (per API contract §2.4 & §9.3).
export const HMAC_TIMESTAMP_SKEW_SEC = parseInt(
  process.env.HMAC_TIMESTAMP_SKEW_SEC || '300',
  10
);

// Idempotency key TTL in seconds (server contract §3.1: at least 24h).
export const IDEMPOTENCY_TTL_SEC = parseInt(
  process.env.IDEMPOTENCY_TTL_SEC || '86400',
  10
);

// Default batch window in seconds (IAT spec §7.1: default 5 min, max 60 min).
export const BATCH_WINDOW_SEC = parseInt(
  process.env.BATCH_WINDOW_SEC || '300',
  10
);

// Max leaves per batch (IAT spec §7.2: default 1024).
export const MAX_LEAVES_PER_BATCH = parseInt(
  process.env.MAX_LEAVES_PER_BATCH || '1024',
  10
);

// Pricing card per API contract §6.
export interface CreditPackage {
  package: 'starter' | 'growth' | 'enterprise';
  units: number;
  priceUsd: number;
  unitPriceUsd: number;
}

export const CREDIT_PACKAGES: CreditPackage[] = [
  { package: 'starter', units: 10_000, priceUsd: 150.0, unitPriceUsd: 0.015 },
  { package: 'growth', units: 100_000, priceUsd: 1400.0, unitPriceUsd: 0.014 },
  {
    package: 'enterprise',
    units: 1_000_000,
    priceUsd: 12_500.0,
    unitPriceUsd: 0.0125,
  },
];

export const DEFAULT_UNIT_PRICE_USD = 0.015;
