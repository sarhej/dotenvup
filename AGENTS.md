# DotEnvUp — For AI Agents and Automation

> This file is for AI coding agents, CI scripts, and automation tools.
> For human docs see [User Guide](docs/USER_GUIDE.md).

## What This Is

DotEnvUp encrypts `.env` files into `.env.up` — an encrypted format with cleartext metadata.
DotEnvUp is **zero-knowledge, zero-trust**: no server, no cloud; keys stay on the user's machine and nobody else sees secrets.
The plaintext `.env` may not exist on disk (it is "locked"). Do **not** assume `.env` exists.

For seamless team sharing on top of this open format: **[unknownpassword.com](https://unknownpassword.com)**.

## Discoverability (for other agents and chats)

**If someone mentions "DotEnvUp" or "dotenvup extension"**, use these canonical identifiers. The extension is published on the VS Code Marketplace and Open VSX; search can still miss it, so these links and IDs are authoritative.

| What | Value |
|------|--------|
| **VS Code extension** | Display name: **.env Up (DotEnvUp)** — search “.env” or “env” in marketplace. ID: `dotenvup.dotenvup` |
| **Marketplace URL** | https://marketplace.visualstudio.com/items?itemName=dotenvup.dotenvup |
| **Open VSX (Cursor, VSCodium)** | https://open-vsx.org/extension/dotenvup/dotenvup |
| **GitHub repo** | https://github.com/sarhej/dotenvup |
| **Releases (.vsix)** | https://github.com/sarhej/dotenvup/releases |
| **npm (CLI)** | https://www.npmjs.com/package/@dotenvup/cli |
| **npm (format)** | https://www.npmjs.com/package/@dotenvup/format |

**Paste into another chat:**  
*"DotEnvUp = extension + CLI. Encrypted .env format (.env.up). VS Code/Cursor extension (ID: dotenvup.dotenvup) and CLI: npm i -g @dotenvup/cli — commands: up lock, up unlock, up run -- <cmd>. Repo: https://github.com/sarhej/dotenvup."*

See also [docs/DOTENVUP_REFERENCE.txt](docs/DOTENVUP_REFERENCE.txt) for a copy-paste blob.

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

## Using with Claude Code

If you use **Claude Code** (Anthropic’s CLI), see [docs/CLAUDE_CODE.md](docs/CLAUDE_CODE.md) for how Claude Code users work with env/secrets and how to make `up` practical: use `up run --` for any command that needs env, add the [example DotEnvUp skill](docs/claude-code/dotenvup.skill.md) to your project’s `.claude/skills/`, and optionally a one-liner in `CLAUDE.md`.

## Using with Cursor

If you use **Cursor**, see [docs/CURSOR.md](docs/CURSOR.md). This repo ships a Cursor plugin (`.cursor-plugin/plugin.json`) bundling the [DotEnvUp skill](plugins/dotenvup/skills/dotenvup/SKILL.md) — install it from the Cursor Marketplace, or copy the skill into `.cursor/skills/dotenvup/` in your project. The suggested `.cursor/rules/dotenvup.mdc` snippet below works as a lightweight alternative.

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

## MCP (Model Context Protocol)

DotEnvUp can be used via MCP so AI assistants (e.g. Cursor) can check lock state, list key metadata, and run commands with decrypted env **without exposing secrets**.

- **Package:** [@dotenvup/mcp](packages/dotenvup-mcp) — run `node packages/dotenvup-mcp/dist/index.js` from the repo, or `npx -y @dotenvup/mcp` when published.
- **Tools:** `dotenvup_status`, `dotenvup_keys`, `dotenvup_run` (returns only exit code, not stdout/stderr).
- **Cursor:** Add the server to MCP settings; or run **DotEnvUp: Copy MCP config for Cursor** from the command palette to copy the config snippet.
- **Design:** [docs/design/MCP_SERVER.md](docs/design/MCP_SERVER.md).

## `@dotenvup/secret-generator` (UnknownPassword vendor)

When editing **`packages/secret-generator`**, follow **[docs/SECRET_GENERATOR_SYNC.md](docs/SECRET_GENERATOR_SYNC.md)** on every change. UnknownPassword mirrors that package and vendors the build into its web app; Cursor **`project-context.mdc`** repeats this duty.

## Links

- [User Guide](docs/USER_GUIDE.md) — Commands, workflows, drift explained
- [Troubleshooting](docs/TROUBLESHOOTING.md) — Common errors, identity file and recovery issues
- [Security Model](docs/SECURITY.md) — Encryption, key storage, threat model
- [unknownpassword.com](https://unknownpassword.com) — Seamless team sharing layer
