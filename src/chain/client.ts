import { credentials, ConcordiumGRPCNodeClient } from '@concordium/web-sdk/nodejs';
import {
  AccountAddress,
  buildBasicAccountSigner,
  type AccountSigner,
} from '@concordium/web-sdk';

import {
  AESIRX_ACCOUNT_ADDRESS,
  AESIRX_PRIVATE_KEY,
  CONCORDIUM_NODE_HOST,
  CONCORDIUM_NODE_PORT,
  CONCORDIUM_NODE_TLS,
} from '../config.js';

let cachedClient: ConcordiumGRPCNodeClient | undefined;
let cachedSender: AccountAddress.Type | undefined;
let cachedSigner: AccountSigner | undefined;

export const getGrpcClient = (): ConcordiumGRPCNodeClient => {
  if (!cachedClient) {
    const creds = CONCORDIUM_NODE_TLS
      ? credentials.createSsl()
      : credentials.createInsecure();
    cachedClient = new ConcordiumGRPCNodeClient(
      CONCORDIUM_NODE_HOST,
      CONCORDIUM_NODE_PORT,
      creds
    );
  }
  return cachedClient;
};

export const getSender = (): AccountAddress.Type => {
  if (!cachedSender) {
    if (!AESIRX_ACCOUNT_ADDRESS) {
      throw new Error('AESIRX_ACCOUNT_ADDRESS is not configured');
    }
    cachedSender = AccountAddress.fromBase58(AESIRX_ACCOUNT_ADDRESS);
  }
  return cachedSender;
};

export const getSigner = (): AccountSigner => {
  if (!cachedSigner) {
    if (!AESIRX_PRIVATE_KEY) {
      throw new Error('AESIRX_PRIVATE_KEY is not configured');
    }
    cachedSigner = buildBasicAccountSigner(AESIRX_PRIVATE_KEY);
  }
  return cachedSigner;
};
