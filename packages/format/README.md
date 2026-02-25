# @dotenvup/format

> Reference implementation of the [DotEnvUp v1 Format Specification](https://github.com/sarhej/dotenvup/blob/main/docs/FORMAT_SPEC.md).

Core parser and writer for the `.env.up` encrypted environment file format.

## What is `.env.up`?

An encrypted `.env` file with visible metadata — a "half-open envelope." You can read the key names, versions, and timestamps on the outside without decrypting the secret values inside.

```ini
#!dotenvup v1
# Encrypted-By: @alice
# Created: 2026-02-25T10:00:00Z
# Algorithm: x25519-xchacha20-poly1305
# Encrypted-For: @alice, @bob, @ci
# Key-Id: 066g6-qvv3E
# Project: my-saas-app

[keys]
DB_HOST          v3  2026-02-10T08:00:00Z  @alice
DB_PASSWORD      v5  2026-02-15T10:30:00Z  @alice   # rotated
API_KEY          v2  2026-02-01T00:00:00Z  @alice

[encrypted]
recipient:@alice  nonce:abc123...  ephemeral:def456...  payload:SGVsbG8g...
recipient:@bob    nonce:abc123...  ephemeral:ghi789...  payload:bGQhIFRo...
```

## Installation

```bash
npm install @dotenvup/format
```

## Format Specification

This package implements the **DotEnvUp v1** open standard:

- **[Format Spec (v1)](https://github.com/sarhej/dotenvup/blob/main/docs/FORMAT_SPEC.md)** — Full specification: file structure, cryptography, identity model, security guarantees.
- **Cryptography:** X25519 key exchange + XChaCha20-Poly1305 (AEAD), via libsodium.
- **Multi-recipient:** Encrypt once, decrypt by any authorized recipient (users or CI/CD machines).
- **Lossless roundtrip:** Comments, blank lines, and key ordering from the original `.env` are preserved.

## Documentation

- [Format Spec](https://github.com/sarhej/dotenvup/blob/main/docs/FORMAT_SPEC.md) — The authoritative v1 standard
- [User Guide](https://github.com/sarhej/dotenvup/blob/main/docs/USER_GUIDE.md) — Commands and workflows
- [Security Model](https://github.com/sarhej/dotenvup/blob/main/docs/SECURITY.md) — Threat model and guarantees
- [DotEnvUp on GitHub](https://github.com/sarhej/dotenvup) — Full project and other packages

## License

MIT — [DotEnvUp](https://dotenvup.com) is an open standard.
