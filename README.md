# web3-id-verify

Express + TypeScript backend that does two things:

1. **Verification facade** — wraps Concordium's Credential Verification Service so the AesirX consent SDK can run age/country checks via the Concordium ID App.
2. **AesirX Proof Service** — HMAC-authenticated `/v1/...` endpoints that other AesirX services call to anchor events on Concordium without holding a funded key themselves.

Deployed via Docker alongside Redis and the official Concordium verifier.

---

## Quick start (local)

```bash
# place a funded Concordium account export at keys/private.export
cp .env.example .env
docker compose up --build
curl http://localhost:8084/health
```

To run the API alone against an external verifier:

```bash
npm install
npm run dev   # set VERIFIER_SERVICE_URL=http://localhost:8000 in .env first
```

---

## Endpoints

### Verification facade

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/verification/create` | Build a VPR for a session |
| `POST` | `/verification/verify` | Verify the returned VP, anchor the result |
| `GET`  | `/verification/status/:sessionId` | Poll session state |
| `GET`  | `/health` | Liveness |

<details>
<summary>Request/response examples</summary>

`POST /verification/create`
```json
{
  "connectionId": "<WalletConnect session topic>",
  "statement": {
    "ageCheck": true, "countryCheck": false,
    "minimumAge": 18, "maximumAge": 150,
    "allowedCountries": [], "disallowedCountries": []
  },
  "contextString": "Age verification for example.com",
  "resourceId": "/"
}
```
→ `{ "sessionId": "...", "vpr": {...} }`

`POST /verification/verify`
```json
{ "sessionId": "...", "presentation": {...}, "verificationRequest": {...} }
```
→ `{ "status": "verified", "anchorTransactionHash": "0x..." }` or `{ "status": "failed", "error": "..." }`
</details>

### Proof service

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/v1/proofs/events` | Tier A — direct anchor (immediate confirmed receipt) |
| `POST` | `/v1/proofs/batches/leaves` | Tier B — append to an open batch |
| `POST` | `/v1/proofs/batches/:id/seal` | Build Merkle root, anchor it |
| `GET`  | `/v1/proofs/:id` | Fetch a proof receipt |
| `GET`  | `/v1/proofs/batches/:id` | Fetch batch state |
| `GET`  | `/usage` | Per-tenant credit usage |

See [Proof service: caller's guide](#proof-service-callers-guide) below.

---

## Production deployment

### 1. Funded Concordium account

The proof service needs a base58 account address and hex sign key for `RegisterData` transactions — **not** the wallet JSON export. The verifier container keeps using `keys/private.export`; the proof service uses two env vars instead.

Easiest path is to reuse the verifier's account:

```bash
ADDR=$(jq -r '.value.address' keys/private.export)
KEY=$(jq -r '.value.accountKeys.keys["0"].keys["0"].signKey' keys/private.export)

cat >> .env <<EOF
AESIRX_ACCOUNT_ADDRESS=$ADDR
AESIRX_PRIVATE_KEY=$KEY
CONCORDIUM_NETWORK=testnet
EOF
```

For prod, prefer a **separate** account so the verifier and the anchor signer don't share a key. Either way, the account needs CCD on the chosen network to pay tx fees.

### 2. Start the stack

```bash
docker compose up -d --build
```

| Container | Role | Exposed |
|---|---|---|
| `web3-id-verify-redis` | Redis 7, AOF persistence (`redis-data` volume) | internal |
| `concordium-verifier` | Concordium credential-verification-service | internal |
| `web3-id-verify-api` | Verification facade + proof service | `${PORT:-8084}` |

Front it with Caddy/Nginx for TLS termination → `:8084`.

### 3. Seed an HMAC credential per tenant

The proof service has no public registration endpoint — credentials are written directly to Redis:

```bash
docker compose exec api node dist/scripts/seed-credential.js --org AesirX.io
```

Output (paste into the calling service's env, e.g. `web3-id-backend/api/.env`):

```
AESIRX_PROOF_ORG_ID=AesirX.io
AESIRX_PROOF_CREDENTIAL_ID=cred_AesirX.io_1730xxxxxx
AESIRX_PROOF_SECRET=<64-hex>
```

Flags: `--cred <id>` (pin a stable ID), `--rotate` (overwrite an existing secret), `--secret <hex>` (supply your own).

### 4. Backups

Back up the `redis-data` volume — it holds credentials, batch state, idempotency cache, proof receipts, and usage. Losing it doesn't lose on-chain transactions, but it loses the mapping from event payloads to those transactions.

---

## Environment variables

See `.env.example` for the full list. The non-defaultable ones are flagged below.

### Verification facade

| Var | Default | Notes |
|---|---|---|
| `PORT` | `8084` | API port |
| `CORS_ORIGINS` | `*` | Comma-separated origins. Restrict in prod. |
| `VERIFIER_SERVICE_URL` | `http://concordium-verifier:8000` | Set automatically inside compose |
| `CONCORDIUM_NETWORK` | `testnet` | `testnet` \| `mainnet` |
| `CONCORDIUM_NODE_GRPC` | `https://grpc.testnet.concordium.com:20000` | Used by the verifier container |
| `VERIFICATION_SESSION_TTL` | `300` | Pending-session TTL (seconds) |

### Proof service

| Var | Default | Notes |
|---|---|---|
| `AESIRX_ACCOUNT_ADDRESS` | — | **Required.** Base58 account that signs anchors |
| `AESIRX_PRIVATE_KEY` | — | **Required.** Hex sign key for the above |
| `REDIS_URL` | `redis://redis:6379` | Bundled redis container by default |
| `REDIS_KEY_PREFIX` | `aps` | Namespace for proof-service keys |
| `CONCORDIUM_NODE_HOST` | `grpc.testnet.concordium.com` | gRPC node for anchoring |
| `CONCORDIUM_NODE_PORT` | `20000` | |
| `CONCORDIUM_NODE_TLS` | `true` | `false` for plaintext (local nodes only) |
| `ANCHOR_FINALITY_TIMEOUT_MS` | `60000` | Per-direct-anchor finality wait |
| `HMAC_TIMESTAMP_SKEW_SEC` | `300` | Replay window for `X-Aesirx-Timestamp` |
| `IDEMPOTENCY_TTL_SEC` | `86400` | Idempotency cache TTL |
| `BATCH_WINDOW_SEC` | `300` | Default batch window |
| `MAX_LEAVES_PER_BATCH` | `1024` | Forced-rotation cap |

---

## Proof service: caller's guide

A working Node.js client lives at `web3-id-backend/api/web3/aesirxProofClient.js` (`submitDirect`, `submitLeaf`). Use it as a reference if implementing in another language.

### Authentication

Every `/v1/...` request carries:

| Header | Value |
|---|---|
| `X-Aesirx-Org-Id` | Tenant ID |
| `X-Aesirx-Credential-Id` | HMAC credential ID |
| `X-Aesirx-Timestamp` | RFC 3339 UTC, e.g. `2026-05-05T12:00:00Z` |
| `X-Aesirx-Idempotency-Key` | `sha256(local_event_hash ‖ credential_id)` hex |
| `X-Aesirx-Signature` | HMAC-SHA256 of the canonical request, hex |
| `Content-Type` | `application/json` |

Canonical request (newline-joined):

```
METHOD\nPATH\nTIMESTAMP\nORG_ID\nIDEMPOTENCY_KEY\nSHA256(BODY_BYTES)
```

Signature = `HMAC-SHA256(secret, canonical_request)`. The server recomputes the body hash from bytes-on-the-wire, so send **raw bytes**, not re-serialized JSON. With `axios`: `transformRequest: [(d) => d]`.

### Canonical event payload (v1)

12 fields, hashed via JCS (RFC 8785) into `local_event_hash`:

```json
{
  "schema_version": "v1",
  "org_id": "<tenant>",
  "group_org_id": null,
  "module": "consent",
  "event_type": "interests.consent.granted",
  "occurred_at": "2026-05-05T12:00:00Z",
  "object_type": "interest",
  "object_id_hash": "<sha256 hex>",
  "action": "consent",
  "actor_context_hash": "<sha256 hex>",
  "delta_summary_hash": "<sha256 hex>",
  "sensitivity_level": "sensitive"
}
```

`local_event_hash = sha256(jcs_canonicalize(payload))`. The server recomputes and rejects mismatches.

### Tier A vs Tier B

| Tier | Endpoint | Use for | Returns |
|---|---|---|---|
| A | `POST /v1/proofs/events` | Consent grant, sign-off — needs immediate confirmed receipt | `{ proof_reference_id, status, receipt: { verification_ref: { tx_hash, block_ref }, ... } }` |
| B | `POST /v1/proofs/batches/leaves` | Routine high-volume events | `{ batch_reference_id, leaf_reference, leaf_index, proof_reference_id }` |
| —  | `POST /v1/proofs/batches/:id/seal` | Force-seal a batch | Anchored Merkle root + tx hash |

### Errors

JSON envelope: `{ "error": { "code": "<machine_code>", "message": "..." } }`.

Common codes: `AUTH_INVALID_SIGNATURE`, `AUTH_TIMESTAMP_SKEW`, `IDEMPOTENCY_REPLAY_MISMATCH`, `PAYLOAD_HASH_MISMATCH`, `BATCH_SEALED`.

---

## Wiring the consent SDK

In the embedding site:

```js
window.aesirxVerifierUrl = 'https://verify.example.com';
window.aesirxConcordiumNetwork = 'testnet';
```

The consent SDK routes the "Concordium ID app" verification flow through this backend.

---

## Notes

- Verification-facade sessions live in an in-memory Map; a restart drops them. TTL is 5 minutes, so users just retry pairing.
- Proof-service state is durable in Redis under the `aps:` prefix.
- No PII is stored. Verification side keeps VPR/VP envelopes + anchor tx hash. Proof side stores only hashes of caller-supplied identifiers.
