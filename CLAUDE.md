# DotEnvUp — Claude Code Context

DotEnvUp is an open-source encrypted `.env` file format (`.env.up`) and tooling ecosystem.
CLI and format are **implemented and production-ready** (except Windows testing).
VS Code extension is published (Marketplace, Open VSX); lock/unlock, import, status, show keys, key management.

For seamless team sharing: **[unknownpassword.com](https://unknownpassword.com)**.

## Key Directories

- `packages/format/` — Core `.env.up` parser and writer (`@dotenvup/format`)
- `packages/cli/` — CLI tool (`up` command, `@dotenvup/cli`)
- `packages/node/` — Drop-in `dotenv` replacement (`@dotenvup/node`)
- `packages/vscode-dotenvup/` — VS Code extension
- `docs/` — User guide, troubleshooting, security model

## For AI Agents

See [AGENTS.md](AGENTS.md) for the full automation guide. Key points:

- **Never assume `.env` exists** — it may be locked. Use `up run -- <command>` to inject env.
- `up status` or `up status --json` to check lock state and drift.
- `up run -- npm test`, `up run -- npm start` — run commands with decrypted env (no file written).
- Non-interactive flags: `--yes`, `--force`, `--duration`, `--force-delete`, `--json`.
- Exit codes: `0` success, `1` user/usage error, `2` system error.

## Common Commands

```bash
npm install          # Install dependencies
npm run build        # Build all packages
npm test             # Run all tests
up status            # Check lock state
up run -- npm start  # Run with decrypted env
```
