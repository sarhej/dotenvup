# Changelog

All notable changes to this project are documented here. Package-level notes also live in `packages/*/CHANGELOG.md`.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

Earlier GitHub Releases exist (extension 0.2 through 0.6.x). This file starts at the current public line (extension 0.7.0 and CLI 0.3.0) rather than inventing a full history from tags.

## [0.7.0] / CLI [0.3.0] - 2026-08-25

### Added

- Optional cleartext `[policy]` in `.env.up`: each recipient decrypts only the values listed for them. Key names stay in `[keys]`.
- Merge `up import` (and extension Safe Edit / import): your recipient block is updated; other people's ciphertext is preserved.
- `up verify` and `up reencrypt`. Re-encrypt in policy mode requires a full-catalog holder.
- `up recipients remove` updates `[policy]` and the encrypted block (atomic write).
- Unlock, `up run`, and `up show` refuse ciphertext that exceeds `[policy]`.

### Notes

- Teammates need CLI 0.3.0 or later and extension 0.7.0 or later. An older `up import` still full-replaces `.env.up` and can destroy secrets it never decrypted.
- GitHub Release: [v0.7.0](https://github.com/sarhej/dotenvup/releases/tag/v0.7.0) (extension VSIX). npm: `@dotenvup/format@0.3.0`, `@dotenvup/cli@0.3.0`.

## [0.6.5] - 2026-08-01

macOS Keychain helper notarized; Key Management session UX. See [packages/vscode-dotenvup/CHANGELOG.md](packages/vscode-dotenvup/CHANGELOG.md). Release: [v0.6.5](https://github.com/sarhej/dotenvup/releases/tag/v0.6.5).

## [0.6.3] - 2026-08-01

Encrypted local identity (`identity.enc`) and recovery bundle. Release: [v0.6.3](https://github.com/sarhej/dotenvup/releases/tag/v0.6.3).
