# Concordium account key

Place your Concordium account export file here as `private.export`. The account must be funded with CCD — every VPR creation and VP verification submits a `RegisterData` transaction (small fee per call).

```
keys/private.export
```

The Docker compose mounts this file read-only into the `concordium-verifier` container at `/keys/verifier_account.export`.

## Get an account
- Testnet: https://wallet-proxy.testnet.concordium.com (use the wallet to export account)
- Mainnet: https://wallet.concordium.com

## Export
From Concordium Browser Wallet → account → Settings → Export → save the JSON file as `keys/private.export`.

**Never commit this file.** `.gitignore` already excludes `keys/*.export`.
