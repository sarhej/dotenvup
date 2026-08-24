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
*"DotEnvUp = extension v0.6.5 + CLI. Encrypted .env format (.env.up). VS Code/Cursor extension (ID: dotenvup.dotenvup) and CLI: npm i -g @dotenvup/cli — up lock/unlock/run. Default identity.enc; macOS Keychain/Touch ID is OPT-IN (up key migrate-to-keychain), not default. Agents: never assume .env exists; use up run -- and up status --json. CLI tokens in .env.up let agents run railway/gh/etc without cli login. Skill: https://raw.githubusercontent.com/sarhej/dotenvup/main/skills/dotenvup/SKILL.md · https://dotenvup.com/llms.txt · Repo: https://github.com/sarhej/dotenvup."*

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

## CLI tokens (run user CLIs without overwriting personal logins)

Agents **can** run the user's CLIs when the project token is in `.env.up`. Railway and GitHub are examples; the same pattern works for Wrangler, AWS, Fly, etc.

1. User stores the CLI's token env var in `.env.up` once (agents never invent tokens).
2. Run via `./scripts/cli.sh` if the repo has it, otherwise `up run -- <cli> …` after confirming the key exists (`up keys --json`).
3. **Never** `railway login`, `gh auth login`, `wrangler login`, or other `*:login` / `auth login` — those overwrite the user's personal CLI account.
4. **Never** run the bare CLI if the project token is missing (many CLIs fall through to `~/.railway`, `gh` keyring, etc.).
5. Print identity / present-missing **names** only. Never print token values or `up show`.

```bash
./scripts/cli.sh status
./scripts/cli.sh whoami
./scripts/cli.sh railway whoami                          # example
./scripts/cli.sh run --require CLOUDFLARE_API_TOKEN -- wrangler whoami
```

Reference wrapper: [scripts/cli.sh](scripts/cli.sh). Cursor rule: `.cursor/rules/cli-tokens-dotenvup.mdc`.

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
- **Never print recovery codes**, `up show` output, or private key material into chat/logs.
- **Never run `up init --force`** or `up key upgrade` unless the user explicitly asked (identity changes / interactive recovery).

## Local identity storage (agents)

Release notes: [docs/RELEASE_NOTES_IDENTITY_ENVELOPE.md](docs/RELEASE_NOTES_IDENTITY_ENVELOPE.md).

| `up status --json` field | Meaning |
|--------------------------|---------|
| `keyStorage` | `file-envelope`, `keychain` (macOS opt-in), `plaintext` (legacy), or `absent` |
| `hasRecoveryBundle` | Recovery file exists for active Key-Id |
| `upgradeRecommended` | User should run `up key upgrade` (opt-in; human only) |
| `keychainMigrateRecommended` | macOS + helper + file envelope → human may run `up key migrate-to-keychain` |
| `sessionActive` | In-memory session agent holds the unwrapped key (warm) |

- New installs use `identity.enc` + wrapping key under `~/.dotenvup/`.
- Legacy plaintext `identity` still works until the human upgrades.
- **Keychain / Touch ID is opt-in** (`up key migrate-to-keychain`). Do not run it unless the user asked.
- After one interactive unlock, the **session agent** keeps the key warm (~30m idle / 8h absolute; wiped on lock/sleep). `up session status` / `up session stop`.
- CI: prefer `UP_KEY` / `DOTENVUP_PRIVATE_KEY`; never hang on prompts (`DOTENVUP_NO_PROMPT` / non-TTY). Cold Keychain + no warm session → exit `1`.

## Non-Interactive / CI Flags

All commands work in non-TTY (pipes, CI, agents) with the right flags:

| Flag | Commands | Purpose |
|------|----------|---------|
| `--yes`, `-y` | lock, init, key upgrade | Skip confirmation prompts |
| `--force`, `-f` | lock, unlock, init | Lock with drift; overwrite `.env` on unlock; overwrite identity on init (archives old Key-Id) |
| `--force-delete` | lock | Delete `.env` even if `.env.up` can't be decrypted |
| `--duration <time>` | unlock | Set auto-lock timer (5m, 15m, 1h, etc.) |
| `--json` | status, keys, key recovery status | Machine-readable JSON output |

## Using with Claude Code

If you use **Claude Code** (Anthropic’s CLI), see [docs/CLAUDE_CODE.md](docs/CLAUDE_CODE.md) for how Claude Code users work with env/secrets and how to make `up` practical: use `up run --` for any command that needs env, add the [example DotEnvUp skill](docs/claude-code/dotenvup.skill.md) to your project’s `.claude/skills/`, and optionally a one-liner in `CLAUDE.md`.

## Using with Cursor

If you use **Cursor**, see [docs/CURSOR.md](docs/CURSOR.md). This repo ships a Cursor plugin (`.cursor-plugin/plugin.json`) bundling the [DotEnvUp skill](skills/dotenvup/SKILL.md) — install it from the Cursor Marketplace or [cursor.directory](https://cursor.directory), or copy the skill into `.cursor/skills/dotenvup/` in your project. The suggested `.cursor/rules/dotenvup.mdc` snippet below works as a lightweight alternative.

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
Use `up status --json` for lock state, keyStorage, and sessionActive.
macOS Keychain/Touch ID is opt-in only — do not claim it is default.
You can run user CLIs (railway, gh, wrangler, …) when their token is in .env.up — never `cli login` (overwrites personal accounts); refuse if the token is missing.
Never paste recovery codes or secrets into chat. See AGENTS.md / dotenvup.com/llms.txt.
```

## MCP (Model Context Protocol)

DotEnvUp can be used via MCP so AI assistants (e.g. Cursor) can check lock state, list key metadata, and run commands with decrypted env **without exposing secrets**.

- **Package:** [@dotenvup/mcp](packages/dotenvup-mcp) — `npx -y @dotenvup/mcp`, or `node packages/dotenvup-mcp/dist/index.js` from a repo checkout.
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
