# Using DotEnvUp with Claude Code

This doc summarizes how people work with **Claude Code** (Anthropic’s CLI) and how to make the **up** package practical in that workflow.

## How Claude users can discover and install

There is **no single global "skills marketplace"** — discovery works in two main ways:

### 1. Add the DotEnvUp repo as a plugin marketplace (recommended)

This repo is a **Claude Code plugin marketplace** with one plugin: **dotenvup**. Users add the marketplace and install the plugin:

```shell
/plugin marketplace add sarhej/dotenvup
/plugin install dotenvup@sarhej-dotenvup
```

After that, the **dotenvup** skill is available (namespaced as `/dotenvup:dotenvup`). Claude will automatically use it when the project uses `.env.up` — no need to remember to run the skill manually.

- **Scope:** Choose *user* (all projects), *project* (this repo only), or *local* (this repo, only for you) when installing.
- **Update:** Get the latest plugin with `/plugin marketplace update sarhej-dotenvup`, then reinstall or restart Claude Code if needed.

### 2. Official Anthropic marketplace (optional)

Plugins can be submitted to the **official Anthropic marketplace** so they appear in the built-in Discover tab. To submit DotEnvUp:

- **Console:** [platform.claude.com/plugins/submit](https://platform.claude.com/plugins/submit)
- **Claude.ai:** [claude.ai/settings/plugins/submit](https://claude.ai/settings/plugins/submit)

Submission is manual and reviewed by Anthropic. Until then, use option 1 (add this repo as a marketplace).

### Manual fallback: copy the skill into your project

If you prefer not to use the plugin system, copy the [standalone skill](claude-code/dotenvup.skill.md) into your project as `.claude/skills/dotenvup.md`. See [Making "up" practical](#making-up-practical-for-claude-code-users) below.

## How Claude Code users work

- **Environment variables**: Claude Code loads env from (in order) command-line exports → `.env.local` → project `.env` → shell profile → system. The main secret is often `ANTHROPIC_API_KEY`; projects may also use `.env` for app secrets (DB URLs, API keys).
- **No plaintext .env in repo**: Best practice is to add `.env` to `.gitignore` and never commit it. That matches DotEnvUp: you commit `.env.up` (encrypted) and keep `.env` off disk when not needed.
- **Agent runs shell commands**: Claude Code runs terminal commands (tests, build, run). If the project’s secrets live in a DotEnvUp `.env.up`, the agent must not assume a plaintext `.env` exists.
- **Hooks**: Lifecycle hooks (e.g. `SessionStart`, `PreToolUse`, `PostToolUse`, `SessionEnd`) can run shell scripts. Useful for checks or wrapping commands.
- **Skills**: Markdown in `.claude/skills/` teaches Claude how to do tasks. A small DotEnvUp skill ensures the agent uses `up run --` and checks `up status` when relevant.
- **CLAUDE.md**: Loaded at session start; a short DotEnvUp paragraph here helps in repos that use DotEnvUp.

## Making “up” practical for Claude Code users

### 1. Use `up run --` for any command that needs env

When the project uses DotEnvUp, **never** assume `.env` exists. For any command that needs env (tests, build, dev server):

```bash
up run -- npm test
up run -- npm run build
up run -- npm start
```

This injects decrypted env into the child process and does **not** write `.env` to disk — ideal for an agent that should not persist secrets.

Same idea for **user CLIs** (Railway, `gh`, Wrangler, …): store the token in `.env.up`, then `up run --` or `./scripts/cli.sh`. Never `railway login` / `gh auth login`.

### 2. Check state with `up status` or `up status --json`

Before running env-dependent commands, the agent can check lock state and drift:

```bash
up status
# or machine-readable:
up status --json
```

Use this to decide whether to suggest `up run --` or to warn about drift.

### 3. Add the DotEnvUp skill (plugin or copy-paste)

**Preferred:** Install the DotEnvUp Claude Code plugin so the skill is available automatically: `/plugin marketplace add sarhej/dotenvup` then `/plugin install dotenvup@sarhej-dotenvup`. See [How Claude users can discover and install](#how-claude-users-can-discover-and-install) above.

**Alternatively:** Copy the [standalone skill](claude-code/dotenvup.skill.md) into your repo as `.claude/skills/dotenvup.md`. It tells Claude to use `up run --` and not assume `.env` exists.

### 4. Optional: SessionStart hook to report DotEnvUp state

If you want Claude Code to always see DotEnvUp state at session start, you can run `up status --json` in a `SessionStart` hook and surface the result (e.g. in a small report file or in the hook output). This is optional; the skill alone is enough for the agent to call `up status` when needed.

### 5. One line in CLAUDE.md (for repos using DotEnvUp)

In the project’s `CLAUDE.md`, add:

```markdown
This project uses DotEnvUp. Never assume .env exists (it may be locked).
Use `up run -- <command>` when a command needs environment variables. Use `up status` to check lock state.
```

That gives Claude Code immediate context at session start.

## Summary

| Need | Solution |
|------|----------|
| Run tests/build/start with secrets | `up run -- npm test` (and similar) |
| Know if .env is present / drift | `up status` or `up status --json` |
| Teach Claude the rules | DotEnvUp skill in `.claude/skills/` |
| Session-level context | One-line DotEnvUp note in `CLAUDE.md` |
| Optional automation | SessionStart hook that runs `up status --json` |

See [AGENTS.md](../AGENTS.md) for full CLI reference, exit codes, and non-interactive flags.
