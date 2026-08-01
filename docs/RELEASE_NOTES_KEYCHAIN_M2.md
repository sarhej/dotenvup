# Release notes — macOS Keychain helper (M2, experimental)

> **Honest scope:** Opt-in macOS Keychain storage for the **wrapping key**, with Touch ID / Apple Watch / login password prompts via a signed helper. This is **not** “Touch ID by default.” Session agent (M3) keeps the key warm after the first successful unlock.

Design: [design/KEYCHAIN_TOUCHID.md](design/KEYCHAIN_TOUCHID.md). Setup: [design/KEYCHAIN_M2_SETUP.md](design/KEYCHAIN_M2_SETUP.md).

## What shipped

1. Package `@dotenvup/keychain` — universal `dotenvup-keychain` binary (Developer ID signed + notarized for releases).
2. Envelope `wrap.source: "keychain"` support in `@dotenvup/format`.
3. CLI: `up key migrate-to-keychain` (requires file envelope + recovery bundle first).
4. `up status` / `--json` fields: `keychainHelper`, `keychainMigrateRecommended`; `keyStorage` may be `keychain`.
5. Touch ID / password prompt via **LocalAuthentication** on helper `get` (not Keychain ACL — see below).

### Honest security note (ACL vs LA)

Apple’s data-protection Keychain + `UserPresence` ACL requires entitlements from a **provisioning profile**. A npm-distributed CLI helper cannot hold that profile, so `SecItemAdd` with `kSecAttrAccessControl` fails with **-34018**. M2 stores the wrapping key as `WhenUnlockedThisDeviceOnly` and prompts with LocalAuthentication before reading it. Same-UID malware that bypasses our helper could still call `SecItemCopyMatching` directly; FileVault + recovery codes remain essential. True Keychain ACL is a later hardening step.

## What did **not** ship

- Session agent / one-prompt-per-session (M3)
- Extension Key Management Touch ID UX (M4)
- Auto-migrate on install (still opt-in)
- Landing-page “Touch ID shipped” marketing

## Commands

```bash
up key upgrade                 # file envelope + recovery (if needed)
up key migrate-to-keychain     # move wrapping key into Keychain
up status --json               # keyStorage, keychainMigrateRecommended
```

## Agent / CI

- Never run `migrate-to-keychain` without an explicit user request.
- Prefer `UP_KEY` / `DOTENVUP_PRIVATE_KEY` in CI.
- `DOTENVUP_NO_PROMPT=1`, `CI=true`, or non-TTY: Keychain `get` exits `1` (no hang).
