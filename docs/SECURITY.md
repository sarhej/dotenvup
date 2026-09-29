# DotEnvUp Security Model

Canonical URL: [https://dotenvup.com/security](https://dotenvup.com/security)

There is no DotEnvUp server. Keys are generated on your machine and never leave it. GitHub (or any git host) stores the encrypted `.env.up` file. The host cannot read the values.

This document is the threat model. For how to report a vulnerability, see [SECURITY.md](../SECURITY.md) at the repo root.

## What is encrypted, and what is not

- **Values** in `.env.up` are encrypted per recipient using X25519 and XChaCha20-Poly1305 (libsodium). That is the same hybrid construction [age](https://github.com/FiloSottile/age) uses: X25519 for key agreement, an XChaCha20-Poly1305 AEAD for the payload. We chose it because it is boring and reviewed, not because it is novel.
- **Key names** and per-key metadata (version, timestamp, author, optional notes and origin comments) stay readable in the `[keys]` header. Optional `[policy]` is also cleartext: it lists which recipient may receive which **names**. Values are still ciphertext.
- Comments and original `.env` structure are inside the encrypted payload (`_raw`), not in the cleartext header.

Commit `.env.up`. Delete `.env`. Values are encrypted at rest.

Key names and per-key metadata stay readable. Values do not. If your key names are themselves sensitive, this format is not for you. SOPS and age leak names the same way (YAML keys, recipient stanzas). That is the half-open envelope, specified in [FORMAT_SPEC.md](FORMAT_SPEC.md).

## What this does not protect against

A hostile reader should not be able to write a comment more damaging than this section.

### Same-user processes can see injected secrets

Any process running as the same user can read the environment of a child you started, including via `/proc/<pid>/environ` on Linux.

`up run -- <cmd>` does not hide secrets from the command it runs. It does not hide them from a coding agent running as you. It prevents a plaintext `.env` file sitting on disk waiting to be read or committed.

Once secrets are in a process environment, they are available to that process. That is also true of `export`, of most hosted secret injectors, and of dotenvx `run`. Accidental file ingestion and accidental git commit are the failures this tool is built to stop. It does not claim more.

### Key names are cleartext

See above. Names, timestamps, authors, and `[policy]` rows are readable without a private key.

### This implementation has not been independently audited

The primitives are X25519 and XChaCha20-Poly1305. The DotEnvUp format parser, CLI, extension, and session agent have **not** had an independent cryptographic audit. Do not treat this repo as audited software.

### Session behaviour is not the same on every OS

After one successful unwrap, an in-memory session agent can keep the private key warm: about 30 minutes idle and 8 hours absolute (`up session status`, `up session stop`). Those timers are implemented.

Wipe on screen lock, sleep, or logout:

| Platform | What the code does |
|----------|--------------------|
| macOS | The session agent starts `watch-presence` on the Keychain helper **when that helper is installed**. On `screenLocked`, `sleep`, or `logout` events from the helper, it wipes the cached key and exits. If the helper is missing, this watcher does not start. We have not published a measured test that this fires on every Mac sleep path (clamshell, `pmset`, etc.). |
| Linux | Not implemented. The presence watcher returns immediately unless `process.platform === 'darwin'`. |
| Windows | Not implemented. Same as Linux. |

Do not read "wiped on sleep" as a cross-platform guarantee. On Linux and Windows, the warm session lasts until idle/absolute TTL or `up session stop`.

### Memory, swap, and crash dumps

Decrypted values live in process memory (the editor buffer for Safe Edit, the child environment for `up run`, a temporary `.env` if you unlock to disk). We do not lock pages (`mlock`), we do not encrypt swap, and we do not scrub crash dumps. If that is not mitigated, it is not mitigated.

### Stolen laptop

**Default (file envelope, all platforms):** private key is `identity.enc` under `~/.dotenvup/`, wrapped by a `wrapping-key` file on disk. Anyone who can read both files can decrypt every `.env.up` that key opens. An unlocked user session, malware as that user, or a disk image of an unlocked home directory is enough. Full-disk encryption (FileVault, LUKS, BitLocker) is your OS, not DotEnvUp.

**Opt-in macOS Keychain:** `up key migrate-to-keychain` moves the wrapping key into Keychain with `WhenUnlockedThisDeviceOnly` and a LocalAuthentication prompt (Touch ID, Apple Watch, or login password). The private key still never enters Keychain. This is **not** a full Keychain UserPresence ACL (that needs a provisioned app bundle). A stolen Mac that is powered off or at the lock screen is harder than the file-envelope case. A stolen Mac that is unlocked, or an attacker already running as you, can still reach secrets the same way as in the same-user section above.

**Recovery bundle:** `~/.dotenvup/recovery/<keyId>.dotenvup-key` is passphrase-protected (scrypt + XChaCha20). The bundle without the recovery code does not unlock the identity. The bundle with the code does. Treat the code like a master backup.

**CI:** `UP_KEY` / `DOTENVUP_PRIVATE_KEY` bypasses files and never prompts. Whoever can read that environment can decrypt.

## Where keys live

- **Keypair directory:** `~/.dotenvup/` (mode `0700`).
- **Current default (file envelope):**
  - `identity.enc`: private key encrypted under a random wrapping key (mode `0600`)
  - `wrapping-key`: 32-byte file wrapping key (mode `0600`)
  - `identity.pub`: public key (mode `0644`) for sharing recipients
- **Legacy:** plaintext `identity` (mode `0600`) is still readable until the user runs `up key upgrade`.
- **CI / automation:** `UP_KEY` or `DOTENVUP_PRIVATE_KEY` (base64 private key) overrides files; never prompts.
- **Optional (macOS):** `up key migrate-to-keychain`. See stolen laptop above. Design notes: [design/KEYCHAIN_TOUCHID.md](design/KEYCHAIN_TOUCHID.md).

## Key backup and recovery

- `up init` and `up key upgrade` write `~/.dotenvup/recovery/<keyId>.dotenvup-key` and show a one-time recovery code. Store that code somewhere durable. Check with `up key recovery status`.
- Manual export/import: `up key export` / `up key import`. Bundles are passphrase-protected.
- DotEnvUp never writes raw private keys to logs.
- Migration is opt-in (`up key upgrade`). It does not change Key-Id. Details: [RELEASE_NOTES_IDENTITY_ENVELOPE.md](RELEASE_NOTES_IDENTITY_ENVELOPE.md).

## What we never log

- Decrypted values are never logged.
- Debug mode (`UP_DEBUG=1`) logs paths and key counts only. It skips key names that look secret (for example PASSWORD, API_KEY) and never logs values.
- Error messages redact secret-like key names and never include values.

## Disk access (summary)

| Attacker capability | Result |
|--------------------|--------|
| Read `.env.up` | Metadata and names; cannot decrypt values without the private key |
| Read `.env` | Plaintext if the file exists (unlocked) |
| Read plaintext `identity` (legacy) or both `identity.enc` and `wrapping-key` | Can decrypt `.env.up` for that key |
| Recovery bundle without the recovery code | Cannot decrypt |
| Recovery bundle with the recovery code | Can restore identity |

Lock removes `.env` from disk. Prefer `up key upgrade` on older installs. Day-to-day risk is still plaintext `.env` when unlocked. Use a short unlock duration, Safe Edit, or `up run --`.

## Sharing and recipients

`.env.up` supports multiple recipients. Each recipient's block is encrypted to their public key. Only they can decrypt that block.

Optional `[policy]` defines which key **values** each recipient receives. Key **names** stay visible in `[keys]` for everyone with repo access. Shipped in `@dotenvup/format` and `@dotenvup/cli`. See [design/TEAM_SECRETS_SOLUTION.md](design/TEAM_SECRETS_SOLUTION.md).

Recipient public keys may come from manual exchange, GitHub SSH keys, or a team directory (for example UnknownPassword). UnknownPassword is optional UX. It is not required to encrypt or decrypt.

## Ed25519-to-X25519 conversion

DotEnvUp can encrypt for a GitHub user who publishes an Ed25519 SSH key. Conversion uses libsodium `crypto_sign_ed25519_pk_to_curve25519` (Ed25519 to X25519). That is the same mapping age uses for `age -R github:username`.

Standard flow: fetch `github.com/{user}.keys`, convert, add as a recipient, re-encrypt `.env.up`. Optional one-off sealed shares use `crypto_box_seal` (ephemeral X25519, XSalsa20-Poly1305). There is no DotEnvUp server in either flow. A share host, if you use one, sees ciphertext only.

Sender authentication is not provided by a recipient block alone. A sealed box is anonymous.

## Local operations

Runtime flows do not phone home. There is no telemetry. GitHub is used only when you ask (fetch a user's SSH keys, clone the repo).
