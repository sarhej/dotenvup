# DotEnvUp Security Model

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

## Audit

- We do not phone home. All operations are local.
- No telemetry or analytics.
- Local operations only (no remote telemetry/analytics calls from runtime flows).
