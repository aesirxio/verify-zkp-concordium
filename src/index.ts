import express from 'express';
import cors from 'cors';
import { CORS_ORIGINS, NETWORK, NODE_ENV, PORT, VERIFIER_SERVICE_URL } from './config.js';
import { createRoute } from './routes/create.js';
import { verifyRoute } from './routes/verify.js';
import { statusRoute } from './routes/status.js';

const app = express();

app.disable('x-powered-by');
app.use(express.json({ limit: '1mb' }));

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

app.post('/verification/create', createRoute);
app.post('/verification/verify', verifyRoute);
app.get('/verification/status/:sessionId', statusRoute);

app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[error]', err);
  res.status(500).json({ error: err.message || 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(
    `[web3-id-verify] listening on :${PORT} (${NODE_ENV}, network=${NETWORK}, verifier=${VERIFIER_SERVICE_URL}, cors=${CORS_ORIGINS.join(',')})`
  );
});
