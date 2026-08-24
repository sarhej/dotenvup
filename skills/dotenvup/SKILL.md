---
name: dotenvup
description: "Manages DotEnvUp encrypted env files (.env.up). Use for .env.up projects, API keys, staging credentials, CLI tokens (railway/gh/wrangler/etc via up run — never cli login), bootstrap/rotate secrets, or any command that needs env — prefer `up run --`, check `up status --json`, never assume .env exists. Explains identity.enc vs opt-in macOS Keychain/session to users."
---

# DotEnvUp: encrypted .env for projects and agents

This project uses DotEnvUp: secrets live in `.env.up` (encrypted, safe to commit). The plaintext `.env` may not exist on disk (it is "locked").

**Current public versions (explain accurately):** Extension **0.6.5** · CLI `@dotenvup/cli` · MCP `@dotenvup/mcp` · Keychain helper `@dotenvup/keychain` (macOS). Site: https://dotenvup.com · Agents: https://github.com/sarhej/dotenvup/blob/main/AGENTS.md

## Explain to the user (short, honest)

When the user asks how DotEnvUp stores keys, Touch ID, or “is it safe,” say:

1. **Default:** private key in encrypted `identity.enc` under `~/.dotenvup/` (plus recovery code at `up init`). Not uploaded anywhere.
2. **macOS Keychain / Touch ID:** **opt-in** via `up key migrate-to-keychain` — not on by default. Prompts use LocalAuthentication (Touch ID / password). Wrapping key is `WhenUnlockedThisDeviceOnly` — not a full OS UserPresence ACL yet.
3. **Session:** after one unlock, a local session agent keeps the key warm (~30 minutes idle / 8 hours absolute); wiped on lock/sleep. Check with `up session status` / `up status --json` (`sessionActive`).
4. **Agents never invent secrets** and never paste recovery codes or `up show` output into chat.
5. **After Keychain migrate:** if Cursor/VS Code cannot decrypt, warm with `up run -- true`. Do **not** run `up init` (that creates a new Key-Id and breaks existing `.env.up`).

## Core rules

1. **Never assume `.env` exists.** Check with `up status` (or `up status --json`) first.
2. **When a command needs environment variables**, run it via `up run -- <command>`:
   - `up run -- npm test`
   - `up run -- npm run build`
   - `up run -- npm start`
3. **Never** print, commit, or paste decrypted secret values into chat, docs, or git.
4. `.env.up` is safe to commit; `.env`, `.env.local`, and `*.local` are not.
5. **Never** put secrets under a browser-exposed prefix like `VITE_`, `NEXT_PUBLIC_`, or `REACT_APP_` — bundlers ship those to the client. Server-only secrets get no prefix (e.g. `OPENAI_API_KEY`, `STAGING_OPERATOR_PASSWORD`).
6. Agents must **not invent secret values** — the user fills them in locally.
7. **Never** ask the user to paste a recovery code or `up show` output into chat. Point them at **DotEnvUp: Key Management** or the terminal.
8. **Local identity:** New installs use encrypted `identity.enc`. If `upgradeRecommended: true`, tell the human to run `up key upgrade` (opt-in; do not auto-run). **macOS Keychain is opt-in** (`up key migrate-to-keychain`). Do **not** claim “Touch ID by default.”
9. **Never** run `up init --force` without explicit user approval (replaces identity after archive).
10. Prefer MCP `dotenvup_status` / `dotenvup_run` when configured (no secrets in tool responses).
11. **You can run the user's CLIs** (Railway, GitHub, Cloudflare, AWS, …) when the token is in `.env.up`. Use `./scripts/cli.sh` if present, or `up run --`. Never `railway login` / `gh auth login` / other `*:login` — that overwrites personal CLI accounts. If the token is missing, refuse (bare CLIs fall through to the user's global login). Never invent tokens.

## Command reference

| Command | Purpose |
|---------|---------|
| `up status` / `up status --json` | Lock state, `keyStorage`, `sessionActive`, `upgradeRecommended`, drift |
| `up init` | Create keypair (`identity.enc` + recovery code; once per machine) |
| `up key upgrade` | Opt-in: recovery + migrate legacy plaintext identity (same Key-Id) |
| `up key migrate-to-keychain` | macOS opt-in: move wrapping key to Keychain (user must ask) |
| `up session status` / `up session stop` | Warm session agent status / stop |
| `up import .env [--delete]` | Encrypt `.env` → `.env.up` |
| `up unlock [--duration 15m]` | Decrypt `.env.up` → `.env` with auto-lock timer |
| `up lock [--yes] [--force]` | Delete plaintext `.env` |
| `up run -- <cmd>` | Inject decrypted env into a process; no `.env` written |
| `up show [KEY]` | Print decrypted value(s) — for the user, never echo in chat |
| `up keys` / `up keys --json` | Key metadata without decrypting |

Exit codes: `0` success, `1` user/usage error, `2` system error.

### `up status --json` fields agents should read

| Field | Meaning |
|-------|---------|
| `keyStorage` | `file-envelope` \| `keychain` \| `plaintext` \| `absent` |
| `sessionActive` | Session agent holds unwrapped key (warm) |
| `upgradeRecommended` | Human should run `up key upgrade` |
| `keychainMigrateRecommended` | macOS + helper + file envelope → human may migrate |
| `hasRecoveryBundle` | Recovery file exists for active Key-Id |

## Workflows

**Bootstrap a repo:**

```bash
up init                    # once per machine; user must save recovery code
cp .env.example .env       # user fills in real values — do not invent them
up import .env --delete
git add .env.up            # encrypted; safe to commit
```

**Add or rotate a secret:**

```bash
up unlock --duration 15m
# edit .env
up import .env --delete
up lock --yes
```

**Daily development:**

```bash
up run -- npm run dev
# or for Vite (reads .env from disk):
up unlock --duration 30m && npm run dev
```

**Optional macOS Keychain (only if user asked):**

```bash
up key migrate-to-keychain
up run -- true             # warm session / Touch ID once
up session status
```

**CLI tokens (agents can act as the user):**

Store the CLI's token env var in `.env.up` once (user fills the value). Then run the CLI through DotEnvUp so personal `railway login` / `gh auth login` accounts stay untouched.

```bash
./scripts/cli.sh status                    # names present/missing only
./scripts/cli.sh whoami                    # identity, not tokens
./scripts/cli.sh railway whoami            # example: RAILWAY_API_TOKEN
./scripts/cli.sh gh api user --jq .login   # example: GH_TOKEN
./scripts/cli.sh run --require CLOUDFLARE_API_TOKEN -- wrangler whoami
# interactive human shell only (not agents):
source scripts/cli.sh env
```

If the repo has no wrapper: `up keys --json` to confirm the key exists, then `up run -- <cli> …`. Same pattern for any service.

## Vite and other file-based bundlers

`up run --` injects `process.env`, but Vite reads `import.meta.env` from `.env*` files on disk. For Vite SPAs, prefer `up unlock` + `.env` over `up run --`.

## Anti-patterns

- Running `npm test` directly when the app expects env — use `up run --`.
- Secrets under `VITE_` / `NEXT_PUBLIC_` (client-bundled).
- Committing `.env` with real values.
- Asking the user to paste secrets into chat.
- Claiming Touch ID / Keychain is on by default.
- Suggesting `up init` after Keychain migrate when decrypt fails.
- Running `railway login` / `gh auth login` / `wrangler login` on the user's machine.
- Running a bare CLI when the project token is missing (falls through to personal login).

Full automation guide: [AGENTS.md](https://github.com/sarhej/dotenvup/blob/main/AGENTS.md). Cursor: [CURSOR.md](https://github.com/sarhej/dotenvup/blob/main/docs/CURSOR.md). LLM digest: https://dotenvup.com/llms.txt
