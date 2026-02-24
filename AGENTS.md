# DotEnvUp — For AI Agents and Automation

> This file is for AI coding agents, CI scripts, and automation tools.
> For human docs see [User Guide](docs/USER_GUIDE.md).

## What This Is

DotEnvUp encrypts `.env` files into `.env.up` — an encrypted format with cleartext metadata.
The plaintext `.env` may not exist on disk (it is "locked"). Do **not** assume `.env` exists.

For seamless team sharing on top of this open format: **[unknownpassword.com](https://unknownpassword.com)**.

## Essential Commands

| Command | What It Does |
|---------|-------------|
| `up status` | Check lock state, `.env.up` presence, keypair, drift |
| `up status --json` | Machine-readable status (JSON to stdout) |
| `up run -- <command>` | Run a command with decrypted env vars injected (no `.env` written) |
| `up unlock --duration 5m --force` | Non-interactive unlock for 5 minutes (overwrites existing `.env`) |
| `up lock --yes` | Non-interactive lock (delete `.env`; fails if drift detected) |
| `up lock --yes --force` | Lock even if `.env` has unsaved changes (drift is discarded) |
| `up lock --force-delete --yes` | Lock even if `.env.up` cannot be decrypted (destructive) |
| `up keys` | List key metadata (names, versions, timestamps) without decrypting |
| `up keys --json` | Machine-readable key metadata (JSON to stdout) |
| `up import .env` | Encrypt `.env` into `.env.up` |
| `up init` | Generate a keypair and store it in `~/.dotenvup/identity` |
| `DotEnvUp: Key Management` | VS Code/Cursor webview for local key status, export/import, and key discovery |

### Preferred: `up run --`

When a command needs environment variables, prefer:

```bash
up run -- npm test
up run -- npm run build
up run -- npm start
```

This injects decrypted env vars into the child process without writing `.env` to disk.

## Exit Codes

| Code | Meaning |
|------|---------|
| `0` | Success |
| `1` | User/usage error (missing file, invalid option, refusal, drift without `--force`) |
| `2` | System error (e.g. failed to remove `.env` from disk) |

Scripts and agents can branch on these codes.

## Safety Rules

- **Never commit `.env`** — it is plaintext. `.env.up` is safe to commit.
- **Never log or expose decrypted values.**
- **Do not assume `.env` exists.** It may be locked. Use `up run --` or check with `up status`.
- If using VS Code/Cursor extension, use `DotEnvUp: Key Management` for key backup/recovery tasks.
- When editing secrets: `up unlock` -> edit `.env` -> `up import .env` -> `up lock`.

## Non-Interactive / CI Flags

All commands work in non-TTY (pipes, CI, agents) with the right flags:

| Flag | Commands | Purpose |
|------|----------|---------|
| `--yes`, `-y` | lock | Skip confirmation prompt |
| `--force`, `-f` | lock, unlock | Lock with drift; overwrite `.env` on unlock |
| `--force-delete` | lock | Delete `.env` even if `.env.up` can't be decrypted |
| `--duration <time>` | unlock | Set auto-lock timer (5m, 15m, 1h, etc.) |
| `--json` | status, keys | Machine-readable JSON output |

## Using with App Builders (e.g. Lovable)

If you use an AI app builder that needs environment variables:

```bash
up run -- <build or dev command>
```

This ensures the app or deployment sees the env vars. No DotEnvUp-specific integration is required in the app builder itself.

## Projects Using DotEnvUp

If your repo uses DotEnvUp, help agents by adding to your project's README or AI context file:

> This project uses DotEnvUp for secret management. Run `up run -- <command>` when a command needs
> environment variables. Do not assume `.env` exists — it may be locked. See [DotEnvUp AGENTS.md](https://github.com/sarhej/dotenvup/blob/main/AGENTS.md).

Suggested Cursor rule for consumer repos (`.cursor/rules/dotenvup.mdc`, `alwaysApply: true`):

```
This project uses DotEnvUp. Never assume .env exists (it may be locked).
Use `up run -- <command>` when a command needs environment variables.
Use `up status` to check lock state. See AGENTS.md in the dotenvup repo.
```

## Links

- [User Guide](docs/USER_GUIDE.md) — Commands, workflows, drift explained
- [Troubleshooting](docs/TROUBLESHOOTING.md) — Common errors, identity file and recovery issues
- [Security Model](docs/SECURITY.md) — Encryption, key storage, threat model
- [unknownpassword.com](https://unknownpassword.com) — Seamless team sharing layer
