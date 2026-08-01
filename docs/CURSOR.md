# Using DotEnvUp with Cursor

This doc covers how **Cursor** users (IDE and CLI agents) work with DotEnvUp, and how to install the DotEnvUp skill so agents handle `.env.up` correctly **and can explain identity / Keychain / session honestly to the user**.

## How Cursor users can discover and install

### 1. Cursor Marketplace plugin (recommended)

This repo is a **Cursor plugin**: [`.cursor-plugin/plugin.json`](../.cursor-plugin/plugin.json) bundles the [dotenvup skill](../skills/dotenvup/SKILL.md) and MCP via [`.cursor-plugin/mcp.json`](../.cursor-plugin/mcp.json) (`npx -y @dotenvup/mcp`). Install from **Customize → Plugins** or search "dotenvup" on the [Cursor Marketplace](https://cursor.com/marketplace) / [cursor.directory](https://cursor.directory).

After install, the skill applies when a project uses `.env.up` (or `/dotenvup` in chat). MCP tools: `dotenvup_status`, `dotenvup_keys`, `dotenvup_run` (no secrets in responses; status includes `keyStorage` / session fields when available).

**macOS Keychain / Touch ID** ([KEYCHAIN_TOUCHID.md](design/KEYCHAIN_TOUCHID.md), shipped opt-in in extension **0.6.5** / CLI): the plugin does **not** own the OS prompt — the signed CLI helper + editor extension do. Skill/MCP make agents session-aware. Human UI: **DotEnvUp: Key Management**.

### 2. Manual fallback: copy the skill

Without the plugin system, copy the skill directly:

```bash
# Project scope (shared with everyone using the repo):
mkdir -p .cursor/skills/dotenvup
curl -o .cursor/skills/dotenvup/SKILL.md \
  https://raw.githubusercontent.com/sarhej/dotenvup/main/skills/dotenvup/SKILL.md

# Or personal scope (all your projects):
mkdir -p ~/.cursor/skills/dotenvup
curl -o ~/.cursor/skills/dotenvup/SKILL.md \
  https://raw.githubusercontent.com/sarhej/dotenvup/main/skills/dotenvup/SKILL.md
```

### 3. Lightweight alternative: a Cursor rule

For consumer repos that just need the basics, add `.cursor/rules/dotenvup.mdc`:

```markdown
---
description: DotEnvUp encrypted env handling
alwaysApply: true
---

This project uses DotEnvUp. Never assume .env exists (it may be locked).
Use `up run -- <command>` when a command needs environment variables.
Use `up status --json` for lock state, keyStorage, and sessionActive.
macOS Keychain/Touch ID is opt-in only (up key migrate-to-keychain) — do not claim it is default.
After Keychain migrate, warm with `up run -- true` if IDE decrypt fails — never up init.
Never paste recovery codes or secret values into chat.
See AGENTS.md and skills/dotenvup/SKILL.md in the dotenvup repo.
```

The rule is always in context (cheap, minimal); the skill adds full workflows (bootstrap, rotation, Vite, Keychain) loaded on demand. Use both if you like.

## What Cursor should explain to the user

| Topic | Correct explanation |
|-------|---------------------|
| Where is my key? | On this machine under `~/.dotenvup/` — default encrypted `identity.enc`, not in the cloud. |
| Touch ID / Keychain? | **Opt-in** (`up key migrate-to-keychain`). Not enabled by default. |
| Why a prompt again? | Cold Keychain or expired session — unlock once; session stays warm ~30m idle / 8h. |
| IDE can’t decrypt after migrate | Run `up run -- true` to warm — **do not** `up init` (new Key-Id). |
| How do agents run tests? | `up run -- npm test` (or MCP `dotenvup_run`) — no plaintext `.env` required. |

LLM digest for crawlers/agents: https://dotenvup.com/llms.txt

## How Cursor agents work with DotEnvUp

- **Agent runs shell commands**: Check `up status` / prefer `up run --`. Never invent secret values.
- **Skills**: [skills/dotenvup/SKILL.md](../skills/dotenvup/SKILL.md) — lock/unlock, Keychain honesty, Vite caveat.
- **Rules**: `.cursor/rules/dotenvup.mdc` for a one-paragraph reminder.
- **MCP**: [@dotenvup/mcp](../packages/dotenvup-mcp) — Command Palette **DotEnvUp: Copy MCP config for Cursor**.

## Testing the plugin locally

```bash
mkdir -p ~/.cursor/plugins/local/dotenvup
cp -R .cursor-plugin skills assets ~/.cursor/plugins/local/dotenvup/
```

Then reload Cursor (`Developer: Reload Window`). The skill appears under Customize → Skills.

## Summary

| Need | Solution |
|------|----------|
| Run tests/build/start with secrets | `up run -- npm test` (and similar) |
| Know lock / Keychain / session | `up status --json` |
| Teach Cursor the rules | DotEnvUp plugin (Marketplace) or skill in `.cursor/skills/` |
| Session-level context | `.cursor/rules/dotenvup.mdc` snippet above |
| Structured agent access | `@dotenvup/mcp` |

See [AGENTS.md](../AGENTS.md) for full CLI reference, exit codes, and non-interactive flags.
