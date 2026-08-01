# DotEnvUp Troubleshooting

## VS Code / Cursor Extension

### Extension doesn't show my `.env` (status bar doesn't react)

If you have a plain `.env` file in your project root but the DotEnvUp status bar does not show "All unprotected" or any lock/unlock options:

1. **Open the project as a folder** — Use **File → Open Folder** and select your project root. The extension only runs when at least one workspace folder is open (not when you open a single file).
2. **Reload the window** — After installing or updating the extension: **Developer: Reload Window** from the Command Palette.
3. **Root is always checked (v0.6.2+)** — The extension now always detects `.env` and `.env.up` in workspace folder roots using the filesystem, so they are found even when excluded from search (e.g. in `.gitignore` or `search.exclude`). If you still don't see the status bar, ensure the folder is opened as above and reload.

Click the status bar item to run the protect flow (Import `.env` → create `.env.up` → lock).

## Common Errors

### "No keypair found. Run: up init"

No usable DotEnvUp identity was found under `~/.dotenvup/` (envelope or legacy plaintext). Run:

```bash
up init
```

Save the one-time recovery code. Check with `up key recovery status`.

### ".env.up not found. Run: up import .env"

No encrypted file exists. Import your `.env`:

```bash
up import .env
```

### ".env.up encrypted with another key — skipping"

The `.env.up` file was created with a different keypair (e.g. on another machine). You cannot decrypt it with your current key. Options:

- Run recovery scan to find matching keys on this machine:
  ```bash
  up recover .env.up
  up recover .env.up --deep
  ```
- Restore the original keypair from backup bundle:
  ```bash
  up key import backup.dotenvup-key
  ```
- If project uses team recipients, verify recipient config and re-import:
  ```bash
  up recipients list
  up recipients add /path/to/teammate.pub --label teammate
  up import .env
  ```
- If key is on another machine: export there (`up key export`) and import here.
- Re-import from plaintext `.env` only if you intentionally want to replace encrypted history.

If no original private key exists anymore, existing `.env.up` content cannot be decrypted by design.

### "Wrong key" on a project that used to work (Safe Edit / Unlock)

If Unlock or **Safe Edit** suddenly report "incorrect key pair" or "No recipient block could be decrypted" on a project that worked before, DotEnvUp is using a *different* key than the one that encrypted the file.

Common causes:

1. **Environment override** — `UP_KEY`, `DOTENVUP_PRIVATE_KEY`, or `DOTENVUP_IDENTITY_DIR` is set (e.g. in your shell profile or a launch config). The extension and CLI use the same priority: env keys first, then `~/.dotenvup`. If one of these points to another identity, that key is used. Clear the variable if you expect to use `~/.dotenvup`.
2. **Identity was replaced** — A new key was written to `~/.dotenvup/identity` (e.g. you ran `up init` again or restored a different backup). The `.env.up` file is still encrypted for the old key. Use **DotEnvUp: Recover key mismatch** (or `up recover .env.up`) to find and import the matching key.
3. **Safe Edit saved with a different key** — If you had an env-based key active when you saved from Safe Edit, the file was re-encrypted only for that key. Use Recover to import that key, or restore `.env.up` from backup if you have it.

**In the extension:** When Safe Edit fails with a key error, use the **Recover key mismatch** button in the message to scan for and import the correct key.

### "Existing .env has local changes. Use --force to overwrite."

Unlock is refusing to overwrite `.env` because it differs from `.env.up`. In scripts (non-TTY), add `--force` if you intend to overwrite:

```bash
up unlock --duration 5m --force
```

### ".env has changes not in .env.up. Import first to save them"

You edited `.env` after unlocking but never ran `up import`. Your edits are only in `.env`.

**To save:** Run `up import .env` before locking.

**To discard:** Run `up lock --yes --force`.

### "Refusing to delete .env because .env.up could not be decrypted"

DotEnvUp could not decrypt `.env.up` (missing keypair, wrong key, corrupted file, or missing recipient block), so it refuses to delete plaintext `.env` by default.

This is a safety measure: if `.env` is the only usable copy of your secrets, deleting it would cause data loss.

- **Fix the root cause** (recommended): restore the correct keypair / correct `.env.up`.
- **Delete plaintext anyway** (destructive):

```bash
up lock --force-delete
up lock --force-delete --yes   # scripts/CI
```

### "Not a TTY. Use --yes to lock without confirmation"

You're running `up lock` in a script or pipeline. Add `--yes`:

```bash
up lock --yes
```

### "Failed to remove .env: ..."

The lock command could not delete `.env`. Possible causes:

- File is read-only
- Another process has it open
- Permission denied

Fix permissions or close the file, then run lock again.

### "Invalid UTF-8 in ... Ensure the file is UTF-8 encoded"

The source file has non-UTF-8 bytes. Re-save the file as UTF-8 in your editor.

## Identity File Issues

DotEnvUp stores identity under `~/.dotenvup/`:

| File | Role |
|------|------|
| `identity.enc` + `wrapping-key` | Default file envelope — encrypted private key (mode `0600`) |
| `identity.enc` (Keychain wrap) | After `up key migrate-to-keychain` — wrapping key in macOS Keychain |
| `identity.pub` | Public key (mode `0644`) |
| `identity` | Legacy plaintext private key (still readable until `up key upgrade`) |
| `recovery/<keyId>.dotenvup-key` | Passphrase-protected recovery bundle |
| `identity.bak-<keyId>` | Leftover after upgrade; delete only after unlock/`up run` works |

If `up status` shows `keyStorage: plaintext` or `upgradeRecommended: true`:

```bash
up key upgrade
```

That is opt-in, keeps the same Key-Id, and shows a recovery code once. See [RELEASE_NOTES_IDENTITY_ENVELOPE.md](RELEASE_NOTES_IDENTITY_ENVELOPE.md).

If commands fail due to key errors:

1. Verify files exist:
   ```bash
   ls -la ~/.dotenvup
   up status --json
   ```
2. Fix permissions:
   ```bash
   chmod 700 ~/.dotenvup
   chmod 600 ~/.dotenvup/identity.enc ~/.dotenvup/wrapping-key 2>/dev/null
   chmod 600 ~/.dotenvup/identity 2>/dev/null
   ```
3. Restore from recovery or export:
   ```bash
   up key import ~/.dotenvup/recovery/<keyId>.dotenvup-key
   # or
   up key import backup.dotenvup-key
   ```

**macOS Keychain / Touch ID (opt-in):** after `up key upgrade`, run `up key migrate-to-keychain`. Needs the signed helper from `@dotenvup/keychain-darwin` (bundled in CLI / extension ≥0.6.4). Cancel leaves the file envelope unchanged. After a wipe or new Mac, restore with `up key import` + recovery code. A warm **session agent** (`up run -- true`, or `up session status`) avoids re-prompting until idle/absolute TTL or screen lock / sleep / logout. Design: [KEYCHAIN_TOUCHID.md](design/KEYCHAIN_TOUCHID.md).

### "Failed to decrypt key bundle" / wrong passphrase

- Ensure passphrase is correct.
- Validate without replacing:
  ```bash
  up key import backup.dotenvup-key --dry-run
  ```
- If bundle is corrupted, restore from another backup export.

## Debug Mode

Set `UP_DEBUG=1` or `DOTENVUP_DEBUG=1` for verbose output (paths, key counts; no secrets):

```bash
UP_DEBUG=1 up status
```

## Windows Notes

- Symlinks require Developer Mode or Administrator privileges
- Use `cmd` or PowerShell; the CLI works in both
- Paths use backslashes; the CLI handles them
