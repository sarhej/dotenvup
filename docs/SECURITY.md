# DotEnvUp Security Model

## Zero-knowledge, zero-trust

DotEnvUp is **zero-knowledge** and **zero-trust**: there is no server, no cloud, and no third party that ever sees your secrets or your decryption keys. Encryption and decryption happen only on your machine. Your keypair lives under `~/.dotenvup/` (encrypted envelope by default on new installs); we never have access to it. You don't have to trust us — or anyone else — with your values.

## What Is Encrypted

- **Values** in `.env.up` are encrypted per-recipient using X25519-XChaCha20-Poly1305.
- **Metadata** (key names, versions, timestamps, authors) is stored in cleartext in the `.env.up` header. This lets you see what's inside without decrypting.

## Where Keys Live

- **Keypair directory:** `~/.dotenvup/` (mode `0700`).
- **Current default (file envelope):**
  - `identity.enc` — private key encrypted under a random wrapping key (mode `0600`)
  - `wrapping-key` — 32-byte file wrapping key (mode `0600`)
  - `identity.pub` — public key (mode `0644`) for sharing recipients
- **Legacy:** plaintext `identity` (mode `0600`) is still readable until the user runs `up key upgrade`.
- **CI / automation:** `UP_KEY` or `DOTENVUP_PRIVATE_KEY` (base64 private key) overrides files; never prompts.
- **Not in this release:** macOS Keychain / Touch ID. That moves the wrapping key into Keychain with a presence prompt; see [design/KEYCHAIN_TOUCHID.md](design/KEYCHAIN_TOUCHID.md). Until then, anyone who can read both `identity.enc` and `wrapping-key` can decrypt — same class of local-disk risk as a single `0600` key file, with a clearer path to biometrics later.

## Key Backup and Recovery

- **Automatic recovery (recommended):** `up init` and `up key upgrade` write `~/.dotenvup/recovery/<keyId>.dotenvup-key` and show a one-time recovery code. Store that code somewhere durable. Check with `up key recovery status`.
- **Manual export/import** between machines:
  - `up key export backup.dotenvup-key`
  - `up key import backup.dotenvup-key`
- Export/recovery bundles are passphrase-protected (scrypt + XChaCha20) and include integrity/fingerprint checks.
- DotEnvUp never writes raw private keys to logs.
- **Existing users:** migration is opt-in (`up key upgrade`). It does not change Key-Id. Details: [RELEASE_NOTES_IDENTITY_ENVELOPE.md](RELEASE_NOTES_IDENTITY_ENVELOPE.md).

## What We Never Log

- Decrypted values are never logged.
- Debug mode (`UP_DEBUG=1`) logs paths and key counts only — no key names that look secret (e.g. PASSWORD, API_KEY), and no values.
- Error messages redact secret-like key names and never include values.

## Threat Model (Summary)

| Attacker capability | Result |
|--------------------|--------|
| Disk access (read `.env.up`) | Can see metadata; cannot decrypt without private key |
| Disk access (read `.env`) | Can read plaintext if file exists (unlocked) |
| Access to plaintext `identity` (legacy) or to both `identity.enc` + `wrapping-key` | Can decrypt `.env.up`; full compromise |
| Access to recovery bundle **without** the recovery code | Cannot decrypt (scrypt-protected) |
| Access to recovery bundle **with** the recovery code | Can restore identity (treat the code like a master backup) |

**Mitigation:** Lock removes `.env` from disk. Prefer `up key upgrade` on older installs. The main day-to-day risk surface remains the plaintext `.env` when unlocked — use short unlock durations, Safe Edit, or `up run --`.

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
