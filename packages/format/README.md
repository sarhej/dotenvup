# @dotenvup/format

Core parser and writer for the `.env.up` encrypted environment file format.

## What is `.env.up`?

An encrypted `.env` file with visible metadata. Think of it as a "half-open envelope" — you can read the key names, versions, and timestamps on the outside without decrypting the secret values inside.

```ini
#!dotenvup v1
# Encrypted-By: @alice
# Encrypted-For: @bob, @charlie

[keys]
DB_HOST          v3  2026-02-10T08:00:00Z  @alice
DB_PASSWORD      v5  2026-02-15T10:30:00Z  @alice   # rotated
API_KEY          v2  2026-02-01T00:00:00Z  @alice

[encrypted]
recipient:@bob    nonce:abc123... payload:SGVsbG8g...
recipient:@charlie nonce:def456... payload:bGQhIFRo...
```

## Installation

```bash
npm install @dotenvup/format
```

## Status

See the [User Guide](../../docs/USER_GUIDE.md) and [Security Model](../../docs/SECURITY.md) for format details.
