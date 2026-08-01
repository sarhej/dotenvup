# Manual publish steps — Keychain + session agent (M2–M4)

Ship order matters: npm packages first (CLI/format pull the helper), then extension Marketplace/Open VSX.

## Versions (this release)

| Package | Version |
|---------|---------|
| `@dotenvup/keychain-darwin` | `0.1.0` (first publish; macOS only) |
| `@dotenvup/format` | `0.2.0` |
| `@dotenvup/cli` | `0.2.0` |
| `@dotenvup/mcp` | `0.2.0` |
| `@dotenvup/node` | bump if it depends on format `^0.2.0` |
| Extension `dotenvup` | `0.6.4` |

## Preflight

- [x] `npm run build` + format/cli/keychain tests (local macOS)
- [ ] Manual checklist [KEYCHAIN_M3_MANUAL_TEST.md](design/KEYCHAIN_M3_MANUAL_TEST.md) on a migrated Mac
- [x] Local VSIX smoke: installed `dotenvup-0.6.4.vsix` into Cursor
- [x] Do **not** commit `.env` or re-encrypted demo `.env.up` from personal keys

## npm

**Pending OTP** (logged in as `supersergio`; `npm publish` needs browser/OTP once):

```bash
# From repo root, after build. keychain-darwin first (format optionalDependency).
npm publish --workspace=@dotenvup/keychain-darwin --access public
npm publish --workspace=@dotenvup/format --access public
npm publish --workspace=@dotenvup/node --access public
npm publish --workspace=@dotenvup/cli --access public
npm publish --workspace=@dotenvup/mcp --access public
```

Complete OTP / browser auth if npm prompts. macOS-only package: publish from darwin or ensure `bin/dotenvup-keychain` is in the tarball (`files` + built binary).

## Extension

- [x] VS Code Marketplace **0.6.4** published (2026-08-01)
- [x] Open VSX **0.6.4** published (2026-08-01)

```bash
npm run build --workspace=@dotenvup/keychain-darwin --workspace=@dotenvup/format --workspace=dotenvup
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
