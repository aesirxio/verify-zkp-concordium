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
