# DotEnvUp User Guide

## Overview

DotEnvUp encrypts your `.env` file into a `.env.up` format. **Zero-knowledge, zero-trust** — no server, no cloud; your keys stay on your machine and we never see your secrets. Secrets stay encrypted on disk. You unlock temporarily when working, and lock when done.

## Commands

### up init

Generate a keypair and store it in `~/.dotenvup/identity`.

```bash
up init
```

Use `--force` to overwrite an existing keypair.

### up import [file]

Convert a plaintext `.env` (or other file) to encrypted `.env.up`.

```bash
up import .env
up import my-secrets.env
up import .env --delete   # Delete source after import
```

Creates `.env.up` in the same directory as the source file.

### up unlock

Decrypt `.env.up` and write a temporary `.env` file.

```bash
up unlock                    # Prompts for duration (TTY) or uses 5m default
up unlock --duration 15m     # Auto-lock in 15 minutes
up unlock --duration never   # Stay unlocked until you lock manually
up unlock --until-terminal-exit   # Spawn shell; auto-lock when shell exits
```

**Overwrite protection:** If `.env` already exists and has local changes (differs from `.env.up`), unlock will warn. Use `--force` to overwrite in non-interactive mode.

### up lock

Delete the plaintext `.env` file. Your secrets remain in `.env.up`.

```bash
up lock              # Prompts for confirmation (TTY)
up lock --yes        # Skip confirmation (scripts/CI)
```

**Drift detection:** If you edited `.env` after unlocking and those changes were never imported into `.env.up`, lock will warn and require `--force` to proceed (changes will be lost).

**Safety refusal:** If DotEnvUp cannot decrypt `.env.up` (missing keypair, wrong key, corrupt file), `up lock` will refuse to delete `.env` by default. This prevents accidentally deleting the only copy of your secrets.

To delete plaintext anyway (destructive):

```bash
up lock --force-delete
up lock --force-delete --yes   # scripts/CI
```

### up show [key]

Print decrypted values. Use `up show` for all keys, or `up show DB_HOST` for one.

### up run -- &lt;cmd&gt;

Run a command with decrypted env vars injected. No `.env` file is written.

```bash
up run -- npm start
up run -- python main.py
```

### up keys

List key metadata (names, versions, timestamps) without decrypting values.

### up status

Show lock state, `.env.up` presence, keypair status, and drift (if `.env` differs from `.env.up`).

### up recover [file]

Search local disk for key candidates that match the `Key-Id` required by `.env.up`.

```bash
up recover
up recover .env.up
up recover .env.up --deep
up recover .env.up --json
```

Use this when you see “encrypted with another key” and need to locate a key backup from this machine.

### up recipients <list|add|remove|discover>

Manage extra project recipients so `.env.up` is encrypted for more than your local key. For `add`, you can pass a path to a `.pub` or key-bundle file, or a base64-encoded public key string.

```bash
up recipients list
up recipients add ~/.dotenvup/identity.pub --label alice-laptop
up recipients add "base64publickey..." --label alice
up recipients remove alice-laptop
up recipients discover
up recipients discover --deep
```

Recipients are stored in project file `.dotenvup.recipients.json` (public keys only, no private keys).

### up key export [file]

Export your keypair to a passphrase-protected bundle file.

```bash
up key export
up key export backup.dotenvup-key
up key export backup.dotenvup-key --passphrase "strong-passphrase"
```

### up key import <file>

Import a keypair from a passphrase-protected bundle file.

```bash
up key import backup.dotenvup-key
up key import backup.dotenvup-key --dry-run
up key import backup.dotenvup-key --force
```

## Workflows

### First-time setup

```bash
cd my-project
up init
up import .env
```

If you don't have a `.env` yet, create one with your keys, then run `up import .env`. You now have `.env.up`. Lock to remove plaintext:

```bash
up lock --yes
```

### Daily work

```bash
up unlock --duration 30m
# Work... .env exists, tools load it
# After 30m, .env is auto-deleted
```

Or unlock until you finish your terminal session:

```bash
up unlock --until-terminal-exit
# Work in the spawned shell
# exit or Ctrl+D → .env is deleted
```

### Moving project to another computer

On old machine:

```bash
up key export backup.dotenvup-key
```

On new machine:

```bash
up key import backup.dotenvup-key
up unlock
```

If unsure where the key is, run:

```bash
up recover .env.up --deep
```

### Editing secrets

1. `up unlock`
2. Edit `.env`
3. **Important:** `up import .env` to save changes into `.env.up`
4. `up lock`

If you lock without importing, your edits are lost. The lock command will warn you.

### Team recipient workflow

1. Each teammate shares their **public** key: their public key file (e.g. `~/.dotenvup/identity.pub`) or the `publicKey` value from `up keys --json`.
2. Project owner adds recipients:

```bash
up recipients add /path/to/teammate.pub --label teammate-name
```

3. Re-import secrets so new recipients are included:

```bash
up import .env
```

4. Teammate can now `up unlock` with their own private key.

### Sharing with one other person

Use this when you want a single collaborator (or a deploy key, CI key, etc.) to be able to decrypt the same `.env.up` without any server or account — still the free, zero-knowledge model.

**You (owner):**

1. Get their **public key**. They can share their public key file (e.g. `~/.dotenvup/identity.pub`) or run `up keys --json` and send you the `publicKey` value (base64).
2. Add them as a recipient (from the project root):

   ```bash
   up recipients add /path/to/their.pub --label alice
   ```
   Or paste the base64 public key:

   ```bash
   up recipients add "base64string..." --label alice
   ```
3. Re-encrypt so the file includes them: `up import .env`. (If you use the VS Code/Cursor extension, Lock or Import then Lock does the same.)
4. Share `.env.up` (e.g. via git, USB, secure channel). Do not share `.dotenvup.recipients.json` unless you want to expose who has access; the file itself only holds public keys.

**They (recipient):**

1. Install DotEnvUp and run `up init` if they don't have a keypair yet.
2. Put the `.env.up` file in their project (or open the repo).
3. Run `up unlock` (or use the extension). Decryption uses their local key automatically; no extra steps.

### Using the VS Code / Cursor extension

If you use the DotEnvUp extension in VS Code or Cursor:

- **Status bar** — Click to lock or unlock; the label shows current state (Locked / Unlocked, drift).
- **Command Palette** — Run **DotEnvUp: Unlock**, **DotEnvUp: Lock**, **DotEnvUp: Import**, **DotEnvUp: Show Keys**, **DotEnvUp: Status**, **DotEnvUp: Key Management** (webview for backup/recovery and key discovery), **DotEnvUp: Recipients: Add / List / Remove**, **DotEnvUp: Recover Key Mismatch** (when `.env.up` was encrypted with another key).
- **First Protect** — When the workspace has only `.env` and no `.env.up`, the extension can guide you to encrypt it for the first time.
- **Import All** — Encrypt all `.env` files across workspace folders in one go.
- **Settings** — See the extension README for options such as `confirmOnLock`, `defaultUnlockDuration`, `createBackupBeforeLock` (encrypted `.env.up.bak-<timestamp>` before lock), and `encryptAllEnvFiles`.

## Drift Explained

**Drift** means `.env` has keys or values that differ from what's in `.env.up`.

- **When it happens:** You unlock, edit `.env`, but forget to import.
- **Lock behavior:** Lock detects drift and refuses to delete until you either import (to save) or use `--force` (to discard).
- **Status:** `up status` shows "Drift: .env differs from .env.up" when applicable.

## Options Summary

| Option | Command | Description |
|--------|---------|-------------|
| `--force`, `-f` | lock, unlock | Lock with drift; overwrite `.env` on unlock when it differs |
| `--yes`, `-y` | lock | Skip confirmation |
| `--force-delete` | lock | Delete `.env` even if `.env.up` can’t be decrypted (destructive) |
| `--duration &lt;time&gt;` | unlock | 5m, 15m, 30m, 1h, 2h, or "never" |
| `--until-terminal-exit` | unlock | Spawn shell; lock when it exits |
| `--delete` | import | Delete source file after import |
| `--passphrase` | key export/import | Provide key-bundle passphrase non-interactively |
| `--dry-run` | key import | Validate key bundle + passphrase without replacing local key |
| `--json` | status, keys | Machine-readable JSON output to stdout |
| `--deep` | recover | Deep scan full home directory for key candidates |
| `--label <name>` | recipients add | Optional human label for recipient entry |

## Exit Codes

| Code | Meaning |
|------|---------|
| `0` | Success |
| `1` | User/usage error — missing file, invalid option, refusal (e.g. drift without `--force`) |
| `2` | System error — e.g. `lock` could not remove `.env` from disk |

Scripts and agents can branch on these codes. For example:

```bash
up lock --yes
if [ $? -eq 1 ]; then echo "User error (drift?)"; fi
if [ $? -eq 2 ]; then echo "System error"; fi
```

## Scripting and AI Agents

For automation, scripts, CI, and AI coding agents, see [AGENTS.md](../AGENTS.md).

Key points:
- Use `up run -- <command>` to run with decrypted env (no `.env` written).
- Use `up status --json` and `up keys --json` for machine-readable output.
- Use `--yes`, `--force`, `--duration`, `--force-delete` for non-interactive use.

## Manual test checklist (interactive)

- **Unlock until terminal exits**

```bash
up unlock --until-terminal-exit
# Verify .env exists, then exit the subshell
exit
# Verify .env is deleted
```

- **Lock refusal + force-delete**

If `.env.up` can’t be decrypted, verify:

```bash
up lock                 # refuses with instructions
up lock --force-delete  # proceeds (interactive)
```
