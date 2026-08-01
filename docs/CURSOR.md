# Using DotEnvUp with Cursor

This doc covers how **Cursor** users (IDE and CLI agents) work with DotEnvUp, and how to install the DotEnvUp skill so agents handle `.env.up` correctly.

## How Cursor users can discover and install

### 1. Cursor Marketplace plugin (recommended)

This repo is a **Cursor plugin**: [`.cursor-plugin/plugin.json`](../.cursor-plugin/plugin.json) bundles the [dotenvup skill](../skills/dotenvup/SKILL.md) and MCP via [`.cursor-plugin/mcp.json`](../.cursor-plugin/mcp.json) (`npx -y @dotenvup/mcp`). Install from **Customize → Plugins** or search "dotenvup" on the [Cursor Marketplace](https://cursor.com/marketplace) / [cursor.directory](https://cursor.directory).

After install, the skill applies when a project uses `.env.up` (or `/dotenvup` in chat). MCP tools: `dotenvup_status`, `dotenvup_keys`, `dotenvup_run` (no secrets in responses).

**macOS Touch ID / Keychain** (design: [KEYCHAIN_TOUCHID.md](design/KEYCHAIN_TOUCHID.md)): the plugin does not own the OS prompt — the CLI helper + editor extension do. Skill/MCP make agents session-aware (unlock once, then run). Human UI: **DotEnvUp: Key Management**.

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
Use `up status` to check lock state. See AGENTS.md in the dotenvup repo.
```

The rule is always in context (cheap, minimal); the skill adds full workflows (bootstrap, rotation, Vite handling) loaded on demand. Use both if you like.

## How Cursor agents work with DotEnvUp

- **Agent runs shell commands**: Cursor agents run tests, builds, and dev servers. If secrets live in `.env.up`, the agent must not assume a plaintext `.env` exists — the skill teaches it to check `up status` and use `up run --`.
- **Skills**: Markdown in `.cursor/skills/` (or from plugins) that the agent loads when relevant. The DotEnvUp skill covers lock/unlock, secret rotation, and the Vite `import.meta.env` caveat.
- **Rules**: `.cursor/rules/*.mdc` files loaded at session start — good for a one-paragraph DotEnvUp reminder in repos that use it.
- **MCP**: For structured access without shell parsing, the [@dotenvup/mcp](../packages/dotenvup-mcp) server exposes `dotenvup_status`, `dotenvup_keys`, and `dotenvup_run`. Run **DotEnvUp: Copy MCP config for Cursor** from the command palette to get the config snippet.

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
| Know if .env is present / drift | `up status` or `up status --json` |
| Teach Cursor the rules | DotEnvUp plugin (Marketplace) or skill in `.cursor/skills/` |
| Session-level context | `.cursor/rules/dotenvup.mdc` snippet |
| Structured agent access | [@dotenvup/mcp](../packages/dotenvup-mcp) server |

See [AGENTS.md](../AGENTS.md) for full CLI reference, exit codes, and non-interactive flags.
