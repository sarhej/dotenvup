# DotEnvUp Troubleshooting

## Common Errors

### "No keypair found. Run: up init"

No local DotEnvUp identity was found at `~/.dotenvup/identity`. Run:

```bash
up init
```

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

DotEnvUp stores identity files in `~/.dotenvup`:

- `identity` (private key, expected mode `0600`)
- `identity.pub` (public key)

If commands fail due to key errors:

1. Verify files exist:
   ```bash
   ls -la ~/.dotenvup
   ```
2. Fix permissions:
   ```bash
   chmod 700 ~/.dotenvup
   chmod 600 ~/.dotenvup/identity
   ```
3. Restore from backup:
   ```bash
   up key import backup.dotenvup-key
   ```

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
