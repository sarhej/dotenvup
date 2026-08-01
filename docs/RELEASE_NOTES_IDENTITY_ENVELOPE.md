# Release notes — Encrypted local identity + recovery (M1)

> **Honest scope:** This release hardens how DotEnvUp stores your **local private key**. It does **not** add macOS Touch ID / Keychain prompts. Biometric unlock is a later milestone ([design](design/KEYCHAIN_TOUCHID.md)).

Tagline for changelogs and stores: **Encrypted local identity + automatic recovery codes.**

## Why ship this now

Until now, many installs kept the private key as a plaintext file (`~/.dotenvup/identity`, mode `0600`) — the same trust model as `~/.ssh/id_*`. That works, but any process that can read that file can decrypt every `.env.up` for that Key-Id.

This release:

1. Stores the private key in an **encrypted envelope** (`identity.enc`) under a random wrapping key.
2. Creates an **automatic recovery bundle** at `up init` / `up key upgrade` (EFF passphrase + existing `.dotenvup-key` crypto).
3. Keeps your **Key-Id unchanged** so existing `.env.up` files keep decrypting.
4. Leaves **legacy plaintext readable** until the user opts in via `up key upgrade` (no silent forced migrate).

## What changed (user-visible)

| Topic | Before | After (new installs / after upgrade) |
|-------|--------|--------------------------------------|
| Private key on disk | `~/.dotenvup/identity` (plaintext base64) | `identity.enc` + `wrapping-key` (file envelope) |
| Public key | `identity.pub` | unchanged |
| Backup | Manual `up key export` | Auto recovery under `~/.dotenvup/recovery/<keyId>.dotenvup-key` + one-time code |
| Existing users | n/a | Opt-in: `up key upgrade` (recovery first, then envelope; `.bak` kept) |
| Touch ID | n/a | **Not in this release** |

## Commands

```bash
up init                 # new machines: envelope + recovery code (save the code)
up init --yes           # skip "saved" confirmation
up key upgrade          # existing plaintext → envelope + recovery (Key-Id unchanged)
up key upgrade --yes
up key recovery status  # is a recovery bundle present?
up status --json        # keyStorage, upgradeRecommended, hasRecoveryBundle
```

`up key migrate-envelope` is an alias of `up key upgrade`.

## What did **not** change

- `.env.up` format and crypto (X25519 + XChaCha20-Poly1305)
- Lock / unlock / Safe Edit / `up run --` workflows
- CI via `UP_KEY` / `DOTENVUP_PRIVATE_KEY` (still highest priority; no prompts)
- Zero-knowledge stance: no server, no cloud, keys stay on the machine
- Extension marketplace ID (`dotenvup.dotenvup`) — still shares `~/.dotenvup` with the CLI

## Trust & safety (existing users)

Migration is **opt-in** and fail-safe:

1. Recovery bundle is written and verified **before** the envelope replaces plaintext.
2. `identity.bak-<keyId>` is written; plaintext is removed only after envelope decrypt verifies the **same** key bytes.
3. If `identity.enc` is corrupt, the CLI falls back to plaintext if it is still present.
4. Agents/CI must **not** run interactive `up key upgrade` unless the user asked. Prefer `up status --json` and tell the human.

After a successful unlock/`up run` on a real project, users may delete `identity.bak-*`.

## Packages to publish together

| Package | Notes |
|---------|--------|
| `@dotenvup/format` | Envelope + migrate APIs |
| `@dotenvup/cli` | `init` / `upgrade` / status fields; depends on `@dotenvup/secret-generator` |
| `@dotenvup/secret-generator` | Used for recovery passphrases (already in-repo) |
| `@dotenvup/mcp` | Already on npm `0.1.0`; no secrets in tools |
| Extension | Optional copy/status update; no format change required to keep working |

## Messaging do / don’t

**Do say**

- “Your DotEnvUp private key is now stored in an encrypted envelope on disk.”
- “New installs get a one-time recovery code — save it.”
- “Existing users: run `up key upgrade` when ready (opt-in).”
- “macOS Touch ID is on the roadmap; not in this release.”

**Don’t say**

- “Touch ID is here” / “Keychain unlock” / “like 1Password” for this build
- “We auto-migrated everyone” (we didn’t)
- “Your keys are in iCloud” (they aren’t; wrapping key is local file until M2)

## Agent / automation notes

See [AGENTS.md](../AGENTS.md) § Local identity storage. Summary:

- Never print recovery codes or `up show` output into chat.
- Never run `up init --force` without explicit user approval (archives/replaces identity).
- If `upgradeRecommended: true` in `up status --json`, tell the user; do not auto-upgrade in CI.
- Prefer `up run --` for commands that need env.

## Links

- Design (incl. future Touch ID): [KEYCHAIN_TOUCHID.md](design/KEYCHAIN_TOUCHID.md)
- User Guide: [USER_GUIDE.md](USER_GUIDE.md) (`up key upgrade`)
- Security model: [SECURITY.md](SECURITY.md)
- Troubleshooting: [TROUBLESHOOTING.md](TROUBLESHOOTING.md)
