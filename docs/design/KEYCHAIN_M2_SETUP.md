# M2 setup — Apple signing & notarization for `@dotenvup/keychain-darwin`

Prerequisites for shipping a **Developer ID–signed + notarized** Swift helper. Open source stays MIT; this only covers the macOS binary you distribute.

Related: [KEYCHAIN_TOUCHID.md](KEYCHAIN_TOUCHID.md).

## Inventory (this machine, 2026-08-01)

| Item | Status | Notes |
|------|--------|--------|
| Xcode / `swiftc` | ✅ | Swift 6.3.x, Xcode at Downloads path |
| **Developer ID Application** | ✅ | `Developer ID Application: Pamakid s.r.o. (85W68GBU9V)` |
| Apple Development certs | ✅ (local only) | Not for distribution — ignore for releases |
| App Store Connect `.p8` key | ✅ | `~/.appstoreconnect/private_keys/AuthKey_YDV2VG57R9.p8` (Key ID `YDV2VG57R9`) |
| `notarytool` keychain profile | ✅ | Profile `dotenvup` stored locally (2026-08-01) |
| GitHub Actions secrets | ❌ | Add after local notarization works |
| Optional package scaffold | ✅ | `@dotenvup/keychain-darwin` — helper + Node bridge |

**Signing identity to use for releases:**

```text
Developer ID Application: Pamakid s.r.o. (85W68GBU9V)
```

Team ID: `85W68GBU9V`

Gatekeeper will show **Pamakid s.r.o.** as the signer. That is fine for OSS. If you later want “DotEnvUp” as the legal entity, create/join an Apple Developer org under that name and issue a new Developer ID Application cert — not required to start M2.

---

## What you still need to do (human steps)

### 1. Confirm App Store Connect API key access

1. Open [App Store Connect → Users and Access → Integrations → App Store Connect API](https://appstoreconnect.apple.com/access/integrations/api).
2. Find key **YDV2VG57R9** (or create a new key with **Developer** access if this one is retired).
3. Copy the **Issuer ID** (UUID at the top of the keys page). You need it once for `notarytool`.

You already have the private key file locally — **do not commit it** and do not paste it into chat.

### 2. Store notarization credentials in Keychain (local)

In Terminal (interactive — you paste Issuer ID):

```bash
xcrun notarytool store-credentials "dotenvup" \
  --key "$HOME/.appstoreconnect/private_keys/AuthKey_YDV2VG57R9.p8" \
  --key-id "YDV2VG57R9" \
  --issuer "<PASTE_ISSUER_ID_UUID_HERE>"
```

Verify:

```bash
xcrun notarytool history --keychain-profile dotenvup
```

(Empty history is OK; “No Keychain password item” means the profile was not stored.)

### 3. Smoke-test sign + notarize (dummy binary)

After the profile exists:

```bash
# Build a tiny binary
echo 'print("ok")' > /tmp/dotenvup-notary-smoke.swift
swiftc /tmp/dotenvup-notary-smoke.swift -o /tmp/dotenvup-notary-smoke

# Sign with Developer ID
codesign --force --options runtime --timestamp \
  --sign "Developer ID Application: Pamakid s.r.o. (85W68GBU9V)" \
  /tmp/dotenvup-notary-smoke

codesign --verify --verbose=2 /tmp/dotenvup-notary-smoke

# Zip + notarize
ditto -c -k --keepParent /tmp/dotenvup-notary-smoke /tmp/dotenvup-notary-smoke.zip
xcrun notarytool submit /tmp/dotenvup-notary-smoke.zip \
  --keychain-profile dotenvup \
  --wait
```

Success looks like `status: Accepted`. Then:

```bash
xcrun stapler staple /tmp/dotenvup-notary-smoke   # may fail for non-.app; OK for CLI zip flow
spctl --assess --verbose=4 /tmp/dotenvup-notary-smoke || true
```

For a CLI helper we typically notarize a **zip**, then ship the signed binary inside the npm package (stapler is more critical for `.app` / `.dmg`).

### 4. GitHub Actions secrets (for CI release)

In [sarhej/dotenvup → Settings → Secrets](https://github.com/sarhej/dotenvup/settings/secrets/actions), add:

| Secret | Value |
|--------|--------|
| `APPLE_DEVELOPER_ID_CERT_P12_BASE64` | Export Developer ID Application cert+key as `.p12`, base64-encode |
| `APPLE_DEVELOPER_ID_CERT_PASSWORD` | Password you set on the `.p12` |
| `APPLE_API_KEY_P8_BASE64` | Base64 of `AuthKey_YDV2VG57R9.p8` |
| `APPLE_API_KEY_ID` | `YDV2VG57R9` |
| `APPLE_API_ISSUER_ID` | Issuer UUID from App Store Connect |
| `APPLE_TEAM_ID` | `85W68GBU9V` |

**Export Developer ID as .p12 (Keychain Access UI):**

1. Keychain Access → **login** → **My Certificates**
2. Find **Developer ID Application: Pamakid s.r.o.**
3. Expand, select cert + private key → right-click → **Export…** → `.p12`
4. Set a strong password; store it in a password manager
5. Encode for GitHub:
   ```bash
   base64 -i ~/Desktop/developer-id.p12 | pbcopy   # macOS
   ```

Never commit `.p12`, `.p8`, or passwords.

### 5. Decide product naming (optional, 2 minutes)

| Choice | Gatekeeper shows | When |
|--------|------------------|------|
| **A — Use Pamakid s.r.o. now** | Pamakid s.r.o. | Start immediately ✅ |
| B — New Apple org “DotEnvUp” | DotEnvUp | Delay M2; extra Apple enrollment |

Recommendation: **A** for M2; rename later if needed (users re-prompt once when signing identity changes — document that).

---

## Agent / CI contract (once secrets exist)

Local (you):

```bash
codesign … --sign "Developer ID Application: Pamakid s.r.o. (85W68GBU9V)" …
xcrun notarytool submit … --keychain-profile dotenvup --wait
```

CI: import `.p12` into a temporary keychain, sign, notarize with API key env vars (no interactive Keychain profile).

---

## After credentials: implementation order

1. Scaffold `packages/keychain-darwin` (Swift helper, `probe|set|get|has|delete|watch-presence`)
2. Local unsigned build + unit tests for CLI protocol
3. Sign + notarize locally with the smoke flow above
4. Wire `@dotenvup/format` / CLI: `wrap.source = keychain`, fallback to file
5. `up key migrate-to-keychain` (require recovery bundle first)
6. GitHub Actions release job
7. npm optional dependency from `@dotenvup/cli`

Helper + M3 session agent shipped. Market as **opt-in** Keychain (`up key migrate-to-keychain`), not “Touch ID by default.”

---

## Checklist (tick as you go)

- [x] Issuer ID copied from App Store Connect
- [x] `notarytool store-credentials "dotenvup" …` succeeded
- [x] Smoke binary: `codesign` + `notarytool submit --wait` → Accepted (2026-08-01)
- [x] Confirm Gatekeeper name **Pamakid s.r.o.** is OK for DotEnvUp releases
- [ ] `.p12` exported + base64 ready (do not paste into chat) — needed for CI only
- [ ] GitHub Actions secrets added — needed for CI only
- [x] M2 helper implemented (`up key migrate-to-keychain`)
