# Manual publish steps — Keychain + session agent (M2–M4)

Ship order matters: npm packages first (CLI/format pull the helper), then extension Marketplace/Open VSX.

## Versions (this release)

| Package | Version |
|---------|---------|
| `@dotenvup/keychain` | `0.1.0` (helper; installs on all OS, runs on macOS). Note: old name `@dotenvup/keychain-darwin` is a broken npm ghost — do not use. |
| `@dotenvup/format` | `0.2.1` |
| `@dotenvup/cli` | `0.2.1` |
| `@dotenvup/mcp` | `0.2.0` |
| `@dotenvup/node` | bump if it depends on format `^0.2.0` |
| Extension `dotenvup` | `0.6.4` |

## Preflight

- [x] `npm run build` + format/cli/keychain tests (local macOS)
- [ ] Manual checklist [KEYCHAIN_M3_MANUAL_TEST.md](design/KEYCHAIN_M3_MANUAL_TEST.md) on a migrated Mac
- [x] Local VSIX smoke: installed `dotenvup-0.6.4.vsix` into Cursor
- [x] Do **not** commit `.env` or re-encrypted demo `.env.up` from personal keys

## npm

**npm status (2026-08-01):**

| Package | Status |
|---------|--------|
| `@dotenvup/format@0.2.1` | published |
| `@dotenvup/cli@0.2.1` | published |
| `@dotenvup/node@0.2.0` | published |
| `@dotenvup/mcp@0.2.0` | published |
| `@dotenvup/keychain@0.1.0` | **ghost** — publish ACK but registry 404 (same for retired `@dotenvup/keychain-darwin`). Check npm org / security hold; helper ships inside extension VSIX and local monorepo builds. |

```bash
# Retry keychain when npm org allows public packages with Mach-O binaries:
npm publish --workspace=@dotenvup/keychain --access public
```

## Extension

- [x] VS Code Marketplace **0.6.4** published (2026-08-01)
- [x] Open VSX **0.6.4** published (2026-08-01)

```bash
npm run build --workspace=@dotenvup/keychain --workspace=@dotenvup/format --workspace=dotenvup
cd packages/vscode-dotenvup && npx vsce package --no-dependencies
npx @vscode/vsce publish --no-dependencies
npx ovsx publish --no-dependencies
```

## CI notarization secrets (optional; local notary profile already works)

Add to GitHub Actions when ready to sign helpers in CI (see [KEYCHAIN_M2_SETUP.md](design/KEYCHAIN_M2_SETUP.md)):

| Secret | Purpose |
|--------|---------|
| `APPLE_CERTIFICATE_P12_BASE64` | Developer ID Application `.p12` |
| `APPLE_CERTIFICATE_PASSWORD` | `.p12` password |
| `APPLE_API_KEY_ID` / `APPLE_API_ISSUER` / `APPLE_API_KEY_P8` | notarytool API key |
| `APPLE_TEAM_ID` | `85W68GBU9V` |

Until then: build/sign/notarize the helper locally with keychain profile `dotenvup`, commit is not required for the binary (gitignored); npm publish includes `bin/`.

## After publish

- [ ] `npm i -g @dotenvup/cli@0.2.0` → `up status --json` shows `keychainHelper` / `sessionActive` fields
- [ ] Marketplace + Open VSX show **0.6.4**
- [ ] Update [tymio.md](tymio.md) / release notes if needed
