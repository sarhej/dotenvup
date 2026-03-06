# DotEnvUp Security Model

## Zero-knowledge, zero-trust

DotEnvUp is **zero-knowledge** and **zero-trust**: there is no server, no cloud, and no third party that ever sees your secrets or your decryption keys. Encryption and decryption happen only on your machine. Your keypair lives at `~/.dotenvup/identity`; we never have access to it. You don't have to trust us — or anyone else — with your values.

## What Is Encrypted

- **Values** in `.env.up` are encrypted per-recipient using X25519-XChaCha20-Poly1305.
- **Metadata** (key names, versions, timestamps, authors) is stored in cleartext in the `.env.up` header. This lets you see what's inside without decrypting.

## Where Keys Live

- **Keypair:** Stored in user-level files under `~/.dotenvup/`.
- **Private key:** `~/.dotenvup/identity` (mode `0600`).
- **Public key:** `~/.dotenvup/identity.pub` (mode `0644`) for sharing recipients.
- **Model:** Same trust model as `~/.ssh/` (filesystem permissions protect local private key).

## Key Backup and Recovery

- Use key export/import to back up and restore identity between machines:
  - `up key export backup.dotenvup-key`
  - `up key import backup.dotenvup-key`
- Export bundles are passphrase-protected and include integrity/fingerprint checks.
- DotEnvUp never writes raw private keys to logs.

## What We Never Log

- Decrypted values are never logged.
- Debug mode (`UP_DEBUG=1`) logs paths and key counts only — no key names that look secret (e.g. PASSWORD, API_KEY), and no values.
- Error messages redact secret-like key names and never include values.

## Threat Model (Summary)

| Attacker capability | Result |
|--------------------|--------|
| Disk access (read `.env.up`) | Can see metadata; cannot decrypt without private key |
| Disk access (read `.env`) | Can read plaintext if file exists (unlocked) |
| Access to `~/.dotenvup/identity` | Can decrypt `.env.up`; full compromise |

**Mitigation:** Lock removes `.env` from disk. The main risk surface is the plaintext `.env` when unlocked. Use short unlock durations or `--until-terminal-exit` to minimize exposure.

## Sharing and Recipients

`.env.up` supports multiple recipients. Each recipient's block is encrypted with their public key. Only they can decrypt. The format supports future features (e.g. team sharing) where recipient public keys come from a server.

## Ed25519-to-X25519 Key Conversion

DotEnvUp supports encrypting shares for GitHub users using their SSH Ed25519 public keys. The conversion uses libsodium's `crypto_sign_ed25519_pk_to_curve25519` function, which performs the standard birational mapping between the Ed25519 (twisted Edwards) and X25519 (Montgomery) curve representations.

This is the same conversion used by:
- **age** (`age -R github:username`)
- **Signal Protocol** (X3DH)
- **WireGuard**

### GitHub User as `.env.up` Recipient (standard flow)

The standard DotEnvUp sharing flow is still the `.env.up` format itself:

1. Sender fetches recipient's SSH Ed25519 key from `github.com/{user}.keys`
2. Ed25519 public key is converted to X25519
3. Sender adds that key as a recipient and re-encrypts `.env.up`
4. Recipient decrypts the shared `.env.up` with the matching private key

This keeps sharing aligned with the open standard: one `.env.up` file, one encrypted block per recipient.

### Dedicated Sealed Shares (optional / one-off flow)

For one-off payloads and share-specific flows, DotEnvUp also supports standalone sealed shares using `crypto_box_seal`:

1. Sender fetches recipient's SSH Ed25519 key from `github.com/{user}.keys`
2. Ed25519 public key is converted to X25519
3. `crypto_box_seal` generates an ephemeral X25519 keypair, performs DH, and encrypts with XSalsa20-Poly1305
4. Only the holder of the corresponding private key can call `crypto_box_seal_open` to decrypt

The server never has the private key and cannot decrypt the payload. This is true zero-knowledge sharing.

### Security Properties

| Property | `.env.up` recipient flow | Standalone sealed share |
|----------|---------------------------|-------------------------|
| Confidentiality | Only listed recipients' private keys decrypt | Only recipient's private key decrypts |
| Server compromise | Server holds ciphertext only; cannot decrypt | Server holds ciphertext only; cannot decrypt |
| Forward secrecy | Per-recipient sealed key wrapping | Each share uses a fresh ephemeral key |
| Sender authentication | Not provided by recipient block alone | Not provided (sealed box is anonymous) |

## Audit

- We do not phone home. All operations are local.
- No telemetry or analytics.
- Local operations only (no remote telemetry/analytics calls from runtime flows).
