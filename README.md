# web3-id-verify

Backend service for the AesirX consent SDK's Concordium ID-app verification flow. Express + TypeScript, deployed via Docker alongside the Concordium Credential Verification Service.

## What it does

The consent SDK (frontend, embedded in 3rd-party sites) talks to this backend to:
1. Create a Verifiable Presentation Request (VPR) anchored on-chain (VRA)
2. Verify the Verifiable Presentation (VP) returned by the Concordium ID App, anchored on-chain (VAA)

This service is a thin facade in front of the Concordium Credential Verification Service Docker. It owns the per-site statement construction, session tracking, and CORS so any embedding site can call it.

## Endpoints

`POST /verification/create`
```json
{
  "connectionId": "<WalletConnect session topic>",
  "statement": {
    "ageCheck": true,
    "countryCheck": false,
    "minimumAge": 18,
    "maximumAge": 150,
    "allowedCountries": [],
    "disallowedCountries": []
  },
  "contextString": "Age verification for example.com",
  "resourceId": "/"
}
```
→ `{ "sessionId": "...", "vpr": {...} }`

`POST /verification/verify`
```json
{
  "sessionId": "...",
  "presentation": {...},
  "verificationRequest": {...}
}
```
→ `{ "status": "verified", "anchorTransactionHash": "0x..." }` or `{ "status": "failed", "error": "..." }`

`GET /verification/status/:sessionId` → current session state

`GET /health` → liveness check

## Local development

```bash
# 1. Place a funded Concordium account export at keys/private.export (see keys/README.md)
# 2. Start everything
cp .env.example .env  # tweak as needed
docker compose up --build

# Health check
curl http://localhost:8084/health
```

To run the API alone (against an externally-running verifier):
```bash
npm install
cp .env.example .env  # set VERIFIER_SERVICE_URL=http://localhost:8000
npm run dev
```

## Production deployment

`docker compose up -d --build` on the server. Behind a reverse proxy (Caddy/Nginx), terminate TLS and forward to the API container's port 8084. The `concordium-verifier` container is internal-only (no published port) — only the API talks to it via the docker network.

Set `CORS_ORIGINS` to a comma-separated list of embedding site origins (e.g. `https://example.com,https://news.example.com`) — `*` is fine for development but restrict it in production.

## Environment variables

See `.env.example`. Key ones:

| Var | Default | Notes |
|---|---|---|
| `PORT` | `8084` | API port |
| `CORS_ORIGINS` | `*` | Comma-separated origins, or `*` |
| `VERIFIER_SERVICE_URL` | `http://concordium-verifier:8000` | Set automatically inside docker-compose |
| `CONCORDIUM_NETWORK` | `testnet` | `testnet` or `mainnet` |
| `CONCORDIUM_NODE_GRPC` | `https://grpc.testnet.concordium.com:20000` | Used by the verifier container |
| `VERIFICATION_SESSION_TTL` | `300` | Seconds before pending sessions expire |

## Wiring the consent SDK

In the embedding site:
```js
window.aesirxVerifierUrl = 'https://verify.example.com';
window.aesirxConcordiumNetwork = 'testnet';
```
The consent SDK will then route the "Concordium ID app" verification flow through this backend.

## Notes

- Sessions are kept in an in-memory Map — restart drops them. Acceptable: TTL is 5 minutes and a dropped session just means the user retries pairing.
- For multi-instance scaling later, swap `src/sessions.ts` for a Redis-backed store; the public API is small (`get/set/delete`) so the change is local.
- No PII is stored: only the VPR/VP envelopes and the on-chain anchor transaction hash.
