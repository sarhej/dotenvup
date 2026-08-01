# Manual publish steps — Keychain + session agent (M2–M4)

Ship order: notarize helper on macOS → npm → extension Marketplace/Open VSX → GitHub Release.

## Versions (current)

| Package | Version |
|---------|---------|
| `@dotenvup/keychain` | **0.1.1** (signed + Apple notarization Accepted; no test files in tarball) |
| `@dotenvup/format` / `@dotenvup/cli` | **0.2.1** |
| `@dotenvup/node` | **0.2.0** (depends on format `^0.2.0`) |
| `@dotenvup/mcp` | **0.2.1** (depends on cli `^0.2.1`) — publish after OTP if pending |
| `@dotenvup/keychain-darwin` | **deprecated** — use `@dotenvup/keychain` |
| Extension | **0.6.5** (notarized helper in VSIX) |

## Safety notes for public users

- Keychain is **opt-in** (`up key migrate-to-keychain`), not default.
- Helper uses LocalAuthentication + `WhenUnlockedThisDeviceOnly` — **not** OS `UserPresence` ACL (needs provisioned app). Documented in SECURITY.md / RELEASE_NOTES_KEYCHAIN_M2.md.
- Session agent is same-UID trust (like ssh-agent); wiped on lock/sleep/logout.
- Never run Init after Keychain migrate (new Key-Id). Warm with `up run -- true`.
- `prepublishOnly` on `@dotenvup/keychain` re-notarizes on macOS — do not publish from Linux.
- Bare Mach-O: stapler error 73 is expected; notary **Accepted** is what matters for Gatekeeper online checks.

## npm (after browser OTP if prompted)

```bash
# From macOS, after: DOTENVUP_CODESIGN=1 DOTENVUP_NOTARIZE=1 npm run build:helper:release -w @dotenvup/keychain
npm publish --workspace=@dotenvup/keychain --access public --ignore-scripts   # if already notarized
# or without --ignore-scripts to force prepublishOnly notarize

npm publish --workspace=@dotenvup/mcp --access public
npm deprecate @dotenvup/keychain-darwin@"*" "Deprecated: use @dotenvup/keychain instead (same helper)."
```

## Extension

```bash
# Ensure packages/keychain-darwin/bin/dotenvup-keychain is notarized Accepted first
npm run build --workspace=dotenvup
cd packages/vscode-dotenvup && npx @vscode/vsce publish --no-dependencies
npx ovsx publish --no-dependencies
```

- [x] Marketplace **0.6.5**
- [ ] Open VSX **0.6.5** (confirm after publish)
- [x] Marketplace **0.6.4** (superseded)

## CI notarization (optional)

Workflow: `.github/workflows/keychain-notarize.yml` — no-ops until all secrets exist:

`APPLE_CERTIFICATE_P12_BASE64`, `APPLE_CERTIFICATE_PASSWORD`, `APPLE_API_KEY_ID`, `APPLE_API_ISSUER`, `APPLE_API_KEY_P8`, `APPLE_TEAM_ID`

Export `.p12` locally; **do not** paste into chat. Add via `gh secret set`.

## After publish

- [x] Local `up` 0.2.1 + Keychain status fields
- [ ] `npm view @dotenvup/keychain version` → 0.1.1
- [ ] `npm view @dotenvup/mcp version` → 0.2.1
- [ ] GitHub Release `v0.6.5` with VSIX attached
- [ ] Human: [KEYCHAIN_M3_MANUAL_TEST.md](design/KEYCHAIN_M3_MANUAL_TEST.md)
