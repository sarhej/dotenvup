# Changelog

All notable changes to the DotEnvUp extension will be documented in this file.

## [0.3.0] - 2026-02-24

### Added

- **Lock with drift: Save & Lock** — When `.env` has changes not saved to `.env.up`, Lock now offers only "Save to .env.up & Lock" or "Cancel". Choosing Save & Lock runs Import (preserves your changes into `.env.up`) then locks. No option to discard changes.
- **Drift check on auto-lock** — Timer auto-lock no longer deletes `.env` when it has unsaved-to-.env.up changes. It skips the lock and logs so you can Import then Lock manually.
- **Drift check on close** — Closing VS Code/Cursor no longer deletes `.env` when it has unsaved-to-.env.up changes. `.env` is left in place with a log message.
- **Tests** — New test suite "Lock with drift" (Save & Lock preserves changes, Cancel leaves files unchanged, dialog has no discard option). Runs when `@dotenvup/format` is loadable.
- **Safety audit** — `packages/vscode-dotenvup/docs/ENV_DELETION_SAFETY_AUDIT.md` documents every code path that can delete or overwrite `.env` and its guard.

### Fixed

- **Data loss prevention** — Lock could previously offer "Lock (discard changes)", which would delete a saved `.env` and lose new lines. That option is removed; the only way to lock when there is drift is to save first (Save to .env.up & Lock).
- **Auto-lock and deactivate** — They previously deleted `.env` after a timer or on close without checking drift, so users could lose data if they had edited `.env` and not run Import. Both paths now check drift and skip deletion when `.env` has changes not in `.env.up`.

## [0.1.2] - 2026-02-24

### Added

- **Key bundle management** — New commands:
  - `DotEnvUp: Export key bundle`
  - `DotEnvUp: Import key bundle`
  - `DotEnvUp: Key Storage Status`
- **Storage mode setting** — Added `dotenvup.keyStorageMode` (current supported mode: `user-file`).

### Fixed

- **Security hardening** — Removed runtime debug/telemetry instrumentation remnants.
- **Deactivation safety** — `deactivate` now uses robust fail-closed safety verification before `.env` deletion.
- **Docs alignment** — Updated security and troubleshooting docs to match actual file-based key storage model.

## [0.1.1] - 2026-02-24

### Added

- **Encrypted backups** — Optional setting `dotenvup.createBackupBeforeLock` to create encrypted `.env.up.bak-<timestamp>` backups before locking.
- **Encrypt All** — Optional setting `dotenvup.encryptAllEnvFiles` to protect all `.env.*` files in the project (e.g. `.env.local`, `.env.test`), not just the main `.env`.
- **Import All command** — New command `DotEnvUp: Import all .env.* files` to bulk-encrypt all plaintext env files in the workspace.
- **Key bundle export/import** — New commands to export and import passphrase-protected key bundles.
- **Key storage status** — New command and setting for explicit storage mode visibility (`user-file`).

### Fixed

- Removed debug/instrumentation runtime calls from extension paths.
- Hardened deactivate flow to use fail-closed safety verification before deleting `.env`.

## [0.1.0] - 2026-02-23

### Added

- **First Protect popup** — Consent-based onboarding: explains local encryption, key storage, and offers UnknownPassword promo before first protect.
- **Comment preservation** — `.env` comments, blank lines, and structure are now encrypted alongside values and restored on unlock. No more losing `# Database` sections or commented-out secrets.
- **Forever unlock** — "Forever (no auto-lock)" option in the unlock duration picker.
- **Shared keystore** — Keys stored at `~/.dotenvup/identity` (works across VS Code, Cursor, CLI, and any editor). Legacy VS Code Secret Storage keys are auto-migrated.
- **Safety guards on every deletion path** — `isSafeToDelete` check before *any* `.env` removal (lock, auto-lock timer, deactivate, import). Backups created before deletion.

### Changed

- **Keypair storage moved** from VS Code Secret Storage to `~/.dotenvup/identity` (cross-IDE, cross-tool).
- **Import flow** now auto-detects `.env` in workspace root (no file picker needed for the common case).
- **Lock command** includes drift detection, decrypt-before-delete verification, TOCTOU recheck, and pre-deletion backup.

### Fixed

- `.env` could be silently deleted without a valid `.env.up` during deactivate or auto-lock — now blocked with safety checks.
- Key regeneration no longer happens silently; the consent popup always appears when no key exists.

## [0.0.1] - 2026-02-15

### Added

- **Lock / Unlock** — Encrypt and decrypt `.env.up` files with one click. Status bar shows lock state.
- **Init** — Generate a local keypair.
- **Import** — Convert an existing `.env` file to encrypted `.env.up`.
- **Show Keys** — View key metadata (names, versions, timestamps) without decryption.
- **Status** — See lock state, key count, and stale key warnings.
- **Safety** — Drift detection, decrypt-before-delete, confirmation dialogs, atomic writes, overwrite protection.
- **Multi-root** — Support for workspaces with multiple folders; quick-pick when several have `.env.up`.
- **Settings** — `confirmOnLock`, `defaultUnlockDuration`, `staleDays`, `autoLockOnClose`.
- **File type** — `.env.up` and `.up` with custom icon and syntax highlighting.
