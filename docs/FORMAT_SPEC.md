# DotEnvUp Format Specification (v1)

**Version:** 1.0.0  
**Status:** Stable  
**Date:** 2026-02-25  
**Maintainer:** DotEnvUp ([sarhej/dotenvup](https://github.com/sarhej/dotenvup))  
**Reference Implementation:** [`@dotenvup/format`](https://www.npmjs.com/package/@dotenvup/format)

---

## 1. Introduction

The **DotEnvUp Format** (`.env.up`) is an encrypted file format for storing environment variables (secrets) securely in version control systems. It is designed as a **"Half-Open Envelope"**: metadata (key names, versions, timestamps, project context) is visible in cleartext, while values and original file structure are encrypted.

### 1.1. Design Goals

1.  **Zero-Knowledge / Zero-Trust:** No central server or key management service is required. Security relies entirely on standard public-key cryptography.
2.  **Git-Friendly:** The file is text-based, safe to commit, and provides visible metadata diffs.
3.  **Metadata Visibility:** Developers can see *which* keys exist, *who* changed them, and *when*, without decryption. This replaces `.env.example`.
4.  **Multi-Recipient:** A single file can be encrypted for multiple users and machines.
5.  **Lossless Roundtrip:** The format preserves comments, blank lines, and ordering of the original `.env` file upon decryption.

### 1.2. Conventions

- **MUST**, **SHOULD**, **MAY**, **OPTIONAL** follow [RFC 2119](https://www.rfc-editor.org/rfc/rfc2119) semantics.
- All timestamps are ISO 8601 (e.g. `2026-02-25T10:00:00Z`).
- All files are UTF-8 encoded.

---

## 2. File Structure

A `.env.up` file is a UTF-8 text file composed of three sections in order:

1.  **Header** — Magic line, file-level metadata, optional context blocks.
2.  **Keys** (`[keys]`) — Cleartext table of key metadata.
3.  **Encrypted** (`[encrypted]`) — Encrypted payload blocks, one per recipient.

Lines starting with `#` are comments. Blank lines are ignored by parsers.

### 2.1. Magic Line

The file MUST begin with:

```
#!dotenvup v1
```

This identifies the file type and format version. Parsers MUST reject files that do not start with `#!dotenvup`.

### 2.2. Header Fields

Immediately following the magic line are key-value header comments.

```ini
#!dotenvup v1
# Encrypted-By: @alice
# Created: 2026-02-25T10:00:00Z
# Algorithm: x25519-xchacha20-poly1305
# Encrypted-For: @alice, @bob, @ci
# Key-Id: 066g6-qvv3E
```

**Required Fields:**

| Field | Type | Description |
| :--- | :--- | :--- |
| `Encrypted-By` | string | Author identifier who last encrypted the file. |
| `Created` | ISO 8601 | Timestamp of the last full encryption. |
| `Algorithm` | string | Encryption suite. MUST be `x25519-xchacha20-poly1305` for v1. |
| `Encrypted-For` | string | Comma-separated list of recipient identifiers. |

**Optional Fields:**

| Field | Type | Description |
| :--- | :--- | :--- |
| `Key-Id` | string | Short fingerprint (12-char Base64url) of the primary recipient's public key. Used for quick identity checks before attempting decryption. |
| `Project` | string | Human-readable project name (e.g. `my-saas-app`). |
| `Repository` | URL | Git repository URL (e.g. `https://github.com/org/my-app`). |

### 2.3. AI Agent Context (OPTIONAL)

The header MAY contain a machine-readable context block for AI coding agents. This block is purely informational and MUST be ignored by parsers.

```ini
#
# AI-AGENT-CONTEXT:
# This file contains encrypted environment secrets (.env.up format).
# The plaintext .env may not exist on disk — it is "locked" by default.
# Do NOT assume .env exists. Use `up run -- <command>` to run with decrypted env.
# ...
```

Generators SHOULD include this block to help AI agents understand the file without documentation.

### 2.4. Structure Comments (OPTIONAL)

The header MAY contain comment lines describing the structure of the original `.env` file (section headers, groupings). These are for human readability and are NOT used during decryption. The authoritative structure is inside the encrypted payload.

```ini
# --- .env structure (comments/grouping from original file) ---
# Database
# API Keys
# Auth / Session
```

### 2.5. Keys Section (`[keys]`)

A cleartext table listing every environment variable present in the file.

```ini
[keys]
DB_HOST          v1  2026-02-25T10:00:00Z  @alice
API_KEY          v3  2026-02-26T14:30:00Z  @bob      # rotated
JWT_SECRET       v1  2026-02-25T10:00:00Z  @ci
```

**Columns** (whitespace-separated):

| # | Column | Required | Description |
| :--- | :--- | :--- | :--- |
| 1 | **Key Name** | Yes | Environment variable name (e.g. `DB_HOST`). |
| 2 | **Version** | Yes | `vN` integer. Incremented on each value change. |
| 3 | **Timestamp** | Yes | ISO 8601 timestamp of the last value change. |
| 4 | **Author** | Yes | Identifier of the user/system that last changed this value. |
| 5 | **Note** | No | Trailing comment starting with `#`. |

Comment lines (`#`) and blank lines within the `[keys]` section MUST be ignored by parsers. Generators MAY interleave comment lines (e.g. section headings from the original `.env`).

**Author** is a per-key, per-version field. Different keys MAY have different authors within the same file:

```ini
DB_HOST          v1  2026-02-25T10:00:00Z  @alice
API_KEY          v3  2026-02-26T14:30:00Z  @bob
```

### 2.6. Encrypted Section (`[encrypted]`)

Contains one or more recipient blocks. Each block allows one recipient to decrypt the file.

```ini
[encrypted]
recipient:@alice  nonce:Base64...  ephemeral:Base64...  payload:Base64...
recipient:@bob    nonce:Base64...  ephemeral:Base64...  payload:Base64...
```

**Fields** (whitespace-separated `key:value` pairs):

| Field | Encoding | Description |
| :--- | :--- | :--- |
| `recipient` | string | Recipient identifier, matching one entry in `Encrypted-For`. |
| `nonce` | Base64 | 24-byte random nonce (XChaCha20). |
| `ephemeral` | Base64 | 32-byte ephemeral public key (informational; also embedded in `payload`). |
| `payload` | Base64 | Encrypted data: `sealed_key \|\| ciphertext` (see §3). |

**Optional Fields** (MAY be present):

| Field | Encoding | Description |
| :--- | :--- | :--- |
| `identity` | string | Verifiable identity hint for the recipient (e.g. `github:alice-dev`, `gitlab:bob`). |

The `identity` field is informational only and MUST NOT be used for access control (the cryptographic key is the sole authority).

---

## 3. Cryptography

The v1 format uses **Hybrid Public-Key Authenticated Encryption**.

**Primitives:**
- **Key Exchange:** X25519 (Curve25519 ECDH)
- **Symmetric Cipher:** XChaCha20-Poly1305 (AEAD, 24-byte nonce)
- **Key Wrapping:** `crypto_box_seal` (Anonymous Sender Encryption)
- **Reference Library:** libsodium (or any compatible implementation)

### 3.1. Encryption

To encrypt entries `E = { key: value, ... }` with optional raw content `R` for recipients `[R1, R2, ...]`:

**Step 1 — Prepare Payload**

Construct a JSON object:
```json
{ "DB_HOST": "localhost", "API_KEY": "secret", "_raw": "# DB\nDB_HOST=localhost\n..." }
```

The `_raw` field is OPTIONAL. When present, it contains the full original `.env` text (comments, blank lines, ordering). On decryption, `_raw` is used to reconstruct the original file with perfect fidelity.

> **Reserved key:** `_raw` is a reserved name within the encrypted payload. Environment variables MUST NOT use this name.

**Step 2 — Symmetric Encryption**

1. Generate a random 32-byte `symmetric_key`.
2. Generate a random 24-byte `nonce`.
3. Encrypt the JSON payload with `crypto_secretbox_easy(payload, nonce, symmetric_key)`.
   Result: `ciphertext`.

**Step 3 — Per-Recipient Key Wrapping**

For each recipient with public key `pk`:

1. Use `crypto_box_seal(symmetric_key, pk)` to wrap the symmetric key.
   Output: `sealed_key` (80 bytes = 32 bytes ephemeral public key + 48 bytes encrypted key + MAC).
2. Concatenate: `combined_payload = sealed_key || ciphertext`.
3. The `ephemeral` field is extracted from `sealed_key[0..32]` for display purposes.

**Output per recipient:**
- `nonce`: Base64 of the 24-byte nonce (same for all recipients).
- `ephemeral`: Base64 of the 32-byte ephemeral public key (informational; also embedded in payload).
- `payload`: Base64 of `combined_payload`.

### 3.2. Decryption

To decrypt as recipient using private key `sk`:

1. Base64-decode `nonce` and `payload`.
2. Split `payload`: first 80 bytes = `sealed_key`, remainder = `ciphertext`.
3. Derive public key: `pk = crypto_scalarmult_base(sk)`.
4. Unseal: `symmetric_key = crypto_box_seal_open(sealed_key, pk, sk)`.
5. Decrypt: `plaintext = crypto_secretbox_open_easy(ciphertext, nonce, symmetric_key)`.
6. Parse JSON. If `_raw` is present, use it as the restored `.env` file. Remove `_raw` from the entries map.

### 3.3. Key Fingerprint (`Key-Id`)

The `Key-Id` header field is computed as:

```
Key-Id = Base64url_no_padding(BLAKE2b(public_key, output_length=8))[0:12]
```

This produces a 12-character identifier for quick "is this my key?" checks before attempting full decryption.

### 3.4. Base64 Encoding

| Context | Variant | Reference |
| :--- | :--- | :--- |
| `nonce`, `ephemeral`, `payload` | Standard Base64 (RFC 4648 §4, `+/=`) | libsodium default |
| `Key-Id` | Base64url without padding (RFC 4648 §5, `-_`) | URL-safe fingerprint |

---

## 4. Identity & Recipients

The format decouples **cryptographic identity** from **human identity**.

### 4.1. Cryptographic Identity

An identity is an **X25519 keypair**:
- **Private key:** 32 bytes. Stored securely (e.g. `~/.dotenvup/identity`, mode `0600`).
- **Public key:** 32 bytes. Shared freely.

### 4.2. Recipient Identifiers

A recipient identifier is a **string label** mapped to a public key. It appears in `Encrypted-For` and `recipient:` fields.

| Pattern | Example | Description |
| :--- | :--- | :--- |
| `@local` | `@local` | Default: the user who created the file. |
| `@name` | `@alice`, `@bob` | Named team members. |
| `@service` | `@ci`, `@prod-server` | Machine/service identities. |
| Free-form | `deploy-bot`, `staging` | Any unique string. |

Recipient-to-public-key mappings are managed outside the file (e.g. `.dotenvup-keys/` directory, UnknownPassword dashboard, or manual exchange).

### 4.3. Identity Hints (OPTIONAL)

The `[encrypted]` block MAY include an `identity` field linking a recipient to a verifiable external account:

```ini
recipient:@alice  identity:github:alice-dev  nonce:...  ephemeral:...  payload:...
recipient:@ci     identity:github-actions:org/my-app  nonce:...  ephemeral:...  payload:...
```

**Purpose:** Allows tools and dashboards to display "encrypted for Alice (github.com/alice-dev)" instead of just "@alice". This is informational only — the cryptographic key remains the sole authority for decryption.

### 4.4. CI/CD & Machine Users

The format explicitly supports non-human recipients. This enables **Zero-Knowledge CI/CD**:

1. Generate a keypair for the CI environment.
2. Add the CI's **public key** as a recipient to `.env.up`.
3. Commit `.env.up` to the repository.
4. Configure the CI runner with its **private key** (e.g. `DOTENVUP_PRIVATE_KEY` secret).
5. The CI decrypts at runtime: `up run -- npm test`.

Developers never see the CI's private key. The CI never sees developers' private keys.

---

## 5. Security Model

### 5.1. Threat Model

- **Attacker capability:** Full read access to the git repository (and thus `.env.up`).
- **Security goal:** Prevent attacker from reading secret values.

### 5.2. Guarantees

| Property | Mechanism |
| :--- | :--- |
| **Confidentiality** | XChaCha20-Poly1305 encryption. Without a recipient's private key, values cannot be read. |
| **Integrity** | Poly1305 MAC. Ciphertext modification is detected on decryption. |
| **Forward Secrecy** | Each encryption uses a fresh ephemeral key (`crypto_box_seal`). Compromise of a long-term key does not decrypt past files encrypted with different ephemeral keys. |
| **Recipient Isolation** | Each recipient's symmetric key is independently sealed. Removing a recipient (re-encrypting without their block) revokes their access. |

### 5.3. Cleartext (Known to Attacker)

The following is **NOT** encrypted:
- **Key names** (e.g. `DB_PASSWORD` exists).
- **Metadata** (who changed it, when, version count).
- **Recipient list** (who can decrypt).
- **Project context** (if `Project` / `Repository` headers are present).
- **Approximate value sizes** (via ciphertext length).

*Rationale:* This metadata is generally low-risk and provides high-value developer experience (auditing, validation, onboarding).

---

## 6. Reserved Fields & Future Extensions

The following are defined in v1 but reserved for future use:

| Field | Location | Status |
| :--- | :--- | :--- |
| `env` | `[keys]` column | Reserved. Intended for environment tags (e.g. `dev`, `staging`, `prod`). |
| `signature` | Between `[keys]` and `[encrypted]` | Reserved for v2. Header + `[keys]` + `[policy]` signature for tamper evidence. See [design/FORMAT_V2.md](design/FORMAT_V2.md). |
| `policy` | Between `[keys]` and `[encrypted]` | **Proposed** (optional). Per-recipient key subsets (cleartext). See [design/TEAM_SECRETS_SOLUTION.md](design/TEAM_SECRETS_SOLUTION.md). |
| `identity` | `[encrypted]` block | Optional in v1. Links recipients to external accounts. |
| `Project` | Header | Optional in v1. Project name. |
| `Repository` | Header | Optional in v1. Git repository URL. |

Parsers MUST ignore unknown header fields and unknown `key:value` pairs in `[encrypted]` blocks. This ensures forward compatibility.

**Possible future extension (backward compatible):** Dedicated sealed files per recipient, e.g. `.env.up.<recipient>` (e.g. `.env.up.octocat`). Same crypto (sealed-box to one recipient); a separate file instead of an extra block in the main `.env.up`. Tools could emit or consume such files without changing the multi-recipient `.env.up` format; existing parsers simply ignore unknown files.

---

## 7. Implementation Notes

- **Column Alignment:** The `[keys]` section uses fixed-width columns for readability. Parsers MUST split on whitespace, not fixed positions.
- **Ordering:** The `[keys]` order does not affect the decrypted file (which uses `_raw`).
- **Line Endings:** Parsers MUST handle both LF (`\n`) and CRLF (`\r\n`).
- **File Extension:** `.env.up` (primary), `.up` (alternative). MIME type: `application/vnd.dotenvup.encrypted`.
- **Multiple `.env` Files:** The format supports variants (e.g. `.env.local.up`, `.env.production.up`). Each is an independent `.env.up` file.

---

## 8. Complete Example

```ini
#!dotenvup v1
# Encrypted-By: @alice
# Created: 2026-02-25T10:00:00Z
# Algorithm: x25519-xchacha20-poly1305
# Encrypted-For: @alice, @bob, @ci
# Key-Id: 066g6-qvv3E
# Project: my-saas-app
# Repository: https://github.com/acme/my-saas-app
#
# AI-AGENT-CONTEXT:
# This file contains encrypted environment secrets (.env.up format).
# The plaintext .env may not exist on disk — it is "locked" by default.
# Do NOT assume .env exists. Use `up run -- <command>` to run with decrypted env.
#
# Git-safe: Safe to commit this file. Key names are visible in the header;
# values are encrypted. New developers see which keys exist without the decryption key.
# Docs: https://github.com/sarhej/dotenvup

# --- .env structure (comments/grouping from original file) ---
# Database
# API Keys
# Auth / Session

[keys]
DB_HOST          v1  2026-02-25T10:00:00Z  @alice
DB_PASSWORD      v3  2026-02-26T14:30:00Z  @alice    # rotated
API_KEY          v2  2026-02-25T12:00:00Z  @bob
JWT_SECRET       v1  2026-02-25T10:00:00Z  @alice

[encrypted]
recipient:@alice  identity:github:alice-dev  nonce:abc123...  ephemeral:def456...  payload:ghi789...
recipient:@bob    identity:github:bob-eng    nonce:abc123...  ephemeral:jkl012...  payload:mno345...
recipient:@ci     identity:github-actions:acme/my-saas-app  nonce:abc123...  ephemeral:pqr678...  payload:stu901...
```

---

## 9. References

- [libsodium Documentation](https://doc.libsodium.org/)
- [RFC 4648 — Base Encodings](https://www.rfc-editor.org/rfc/rfc4648)
- [RFC 2119 — Requirement Level Keywords](https://www.rfc-editor.org/rfc/rfc2119)
- [X25519 — RFC 7748](https://www.rfc-editor.org/rfc/rfc7748)
- [XChaCha20-Poly1305 — Draft RFC](https://datatracker.ietf.org/doc/html/draft-irtf-cfrg-xchacha)
- [DotEnvUp Security Model](SECURITY.md)
- [DotEnvUp Reference Implementation](https://github.com/sarhej/dotenvup/tree/main/packages/format)

---

*Copyright (c) 2026 DotEnvUp Contributors. Released under the MIT License as an Open Standard.*
