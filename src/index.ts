import express from 'express';
import cors from 'cors';

import { CORS_ORIGINS, NETWORK, NODE_ENV, PORT, VERIFIER_SERVICE_URL } from './config.js';
import { createRoute } from './routes/create.js';
import { verifyRoute } from './routes/verify.js';
import { statusRoute } from './routes/status.js';
import proofsDirectRouter from './routes/proofs-direct.js';
import proofsBatchRouter from './routes/proofs-batch.js';
import proofsVerifyRouter from './routes/proofs-verify.js';
import usageRouter from './routes/usage.js';
import { errorHandler } from './middleware/errors.js';

const app = express();

app.disable('x-powered-by');

// JSON parser that also retains the raw bytes — required for HMAC verification.
app.use(
  express.json({
    limit: '1mb',
    verify: (req, _res, buf) => {
      (req as express.Request).rawBody = Buffer.from(buf);
    },
  })
);

const corsOptions: cors.CorsOptions = CORS_ORIGINS.includes('*')
  ? { origin: true, credentials: false }
  : { origin: CORS_ORIGINS, credentials: false };
app.use(cors(corsOptions));

app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    network: NETWORK,
    verifierServiceUrl: VERIFIER_SERVICE_URL,
  });
});

// Legacy wallet flow (Concordium Verify & Access).
app.post('/verification/create', createRoute);
app.post('/verification/verify', verifyRoute);
app.get('/verification/status/:sessionId', statusRoute);

// AesirX Proof Service v1.
app.use('/v1', proofsDirectRouter);
app.use('/v1', proofsBatchRouter);
app.use('/v1', proofsVerifyRouter);
app.use('/v1', usageRouter);

app.use(errorHandler);

app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(
    `[web3-id-verify] listening on :${PORT} (${NODE_ENV}, network=${NETWORK}, verifier=${VERIFIER_SERVICE_URL}, cors=${CORS_ORIGINS.join(',')})`
  );
});
