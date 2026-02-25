# DotEnvUp — VS Code Extension

> `.env` files, but with memory — and a lock.

Encrypt `.env` secrets, API keys, tokens, and environment variables into `.env.up` directly in VS Code (and Cursor). **Zero-knowledge, zero-trust** — no cloud, no server; your keys stay on your machine and we never see your secrets. Lock and unlock with one click, keep AI workflows safe, and use local key backup/recovery — without changing app code.

## Features

- **Zero-knowledge, zero-trust** — No server, no cloud. Keys at `~/.dotenvup/identity`; we never see your secrets.
- **One-click lock / unlock** — Status bar shows lock state; click to toggle. Auto-locks after a timer or when the editor closes.
- **Comment preservation** — Comments, blank lines, commented-out secrets, and ordering survive the encrypt/decrypt roundtrip.
- **Cross-IDE keys** — Keypair stored at `~/.dotenvup/identity`, shared across VS Code, Cursor, CLI, and any tool.
- **First Protect onboarding** — Consent popup on first use explains what happens before any encryption.
- **Import** — Convert an existing `.env` to encrypted `.env.up` (auto-detects `.env` in workspace root).
- **Show Keys** — View key names, versions, and timestamps without decrypting values.
- **Status** — Lock state, key count, stale key warnings, and drift detection.
- **Multi-root workspaces** — Pick which folder to act on when several have `.env.up`.
- **Safety everywhere** — Every `.env` deletion path is guarded: decrypt verification, pre-deletion backups, TOCTOU checks.

### Lock command flow

Lock persists the current `.env` into `.env.up` and removes `.env`. If the file has unsaved changes, a warning lets you lock the **current editor content** (and reminds you to accept or reject any AI edits first).

![Lock command flow](docs/design/lock-command-flow.png)

## Quick Start

1. Open a project that has a `.env` file
2. Click the lock icon in the status bar (or run `DotEnvUp: Lock .env.up`)
3. On first use, a consent popup explains local encryption — click "Protect My .env"
4. Your `.env` is encrypted to `.env.up` and the plaintext is removed
5. Click unlock to temporarily restore `.env` — choose a duration or "Forever"

## Requirements

- VS Code ^1.85.0 or Cursor
- Node.js 20+

## Install (from VSIX)

Download the latest [.vsix from Releases](https://github.com/sarhej/dotenvup/releases) (e.g. [v0.4.0](https://github.com/sarhej/dotenvup/releases/download/v0.4.0/dotenvup-0.4.0.vsix)), then **Extensions** → `...` → **Install from VSIX...**, or:

```bash
code --install-extension dotenvup-0.4.0.vsix   # VS Code
cursor --install-extension dotenvup-0.4.0.vsix # Cursor
```

## Extension Settings

| Setting | Default | Description |
|---------|---------|-------------|
| `dotenvup.confirmOnLock` | `true` | Show confirmation before locking (deleting `.env`). |
| `dotenvup.defaultUnlockDuration` | `5m` | Default auto-lock duration (e.g. `5m`, `15m`, `1h`). |
| `dotenvup.staleDays` | `90` | Keys older than this many days are reported as stale. |
| `dotenvup.autoLockOnClose` | `true` | Remove `.env` when the editor closes (for roots unlocked in this session). |
| `dotenvup.createBackupBeforeLock` | `true` | Before locking, save an encrypted backup of `.env.up` as `.env.up.bak-<timestamp>`. No plaintext backup. |
| `dotenvup.encryptAllEnvFiles` | `false` | Encrypt all `.env.*` files in the project (e.g. `.env.local`, `.env.development`), not only `.env`. Excludes files already ending in `.up`. |
| `dotenvup.keyStorageMode` | `user-file` | Key storage backend mode. Current supported mode: `user-file` (`~/.dotenvup/identity`). |

## Commands

| Command | Description |
|---------|-------------|
| `DotEnvUp: Lock .env.up` | Encrypt and remove plaintext `.env` (with safety checks). |
| `DotEnvUp: Unlock .env.up` | Decrypt `.env.up` to `.env` with auto-lock timer. |
| `DotEnvUp: Import .env to .env.up` | Convert `.env` to encrypted `.env.up`. |
| `DotEnvUp: Import all .env.* files` | Bulk-encrypt all plaintext env files in the workspace (requires `encryptAllEnvFiles: true` for full protect flow). |
| `DotEnvUp: Init (generate keypair)` | Create a local keypair at `~/.dotenvup/identity`. |
| `DotEnvUp: Key Management` | Open webview for local key status, inventory, export/import, and refresh/deep scan. |
| `DotEnvUp: Export key bundle` | Export keypair to passphrase-protected `.dotenvup-key` bundle. |
| `DotEnvUp: Import key bundle` | Import keypair from passphrase-protected bundle. |
| `DotEnvUp: Key Storage Status` | Show active key storage mode and identity file paths. |
| `DotEnvUp: Recover key mismatch` | Guided recovery assistant: find/import matching key, transfer guidance, unrecoverable marker flow. |
| `DotEnvUp: Recipients list` | Show additional recipient public keys configured for this project. |
| `DotEnvUp: Add recipient` | Add recipient public key (paste base64 or choose key file). |
| `DotEnvUp: Remove recipient` | Remove a project recipient by key id/label. |
| `DotEnvUp: Discover recipient keys` | Scan local files for candidate public keys and add one quickly. |
| `DotEnvUp: Show Keys (no decryption)` | List key metadata from the header. |
| `DotEnvUp: Secret Status & Freshness` | Show lock state, drift, and stale keys. |

## Key Storage

Your keypair lives at `~/.dotenvup/identity` (private key, mode `0600`) and `~/.dotenvup/identity.pub` (public key). This location is shared across all IDEs and the CLI — same model as `~/.ssh/`.

If you previously used DotEnvUp 0.0.1, keys in VS Code Secret Storage are automatically migrated to the new location on first use.

## Backup Restore

When `dotenvup.createBackupBeforeLock` is enabled, DotEnvUp creates encrypted snapshots as `.env.up.bak-<timestamp>`.

Current restore flow is manual:

1. Keep current file as rollback: rename `.env.up` to `.env.up.current`
2. Copy selected backup to `.env.up`
3. Run unlock and verify:
   - `up unlock --duration 5m`

If decrypt fails after restore, recover/import the correct key first (`DotEnvUp: Recover key mismatch` or `DotEnvUp: Import key bundle`).

## Links

- [DotEnvUp CLI & format](https://github.com/sarhej/dotenvup) — Open-source format, CLI, and Node.js library (MIT).
- [UnknownPassword](https://unknownpassword.com) — Team sharing, dashboard, and governance on top of `.env.up`.

## License

MIT
