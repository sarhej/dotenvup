---
name: dotenvup
description: "Manages DotEnvUp encrypted env files (.env.up). Use for .env.up projects, API keys, staging credentials, bootstrap/rotate secrets, or any command that needs env — prefer `up run --`, check `up status --json`, never assume .env exists."
---

# DotEnvUp: encrypted .env for projects and agents

This project uses DotEnvUp: secrets live in `.env.up` (encrypted, safe to commit). The plaintext `.env` may not exist on disk (it is "locked").

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
7. **Never** ask the user to paste a recovery code or `up show` output into chat. Point them at Key Management UI or the terminal.
8. **Local identity:** New installs use encrypted `identity.enc` under `~/.dotenvup/`. If `up status --json` has `upgradeRecommended: true`, tell the human to run `up key upgrade` (opt-in; do not auto-run). **macOS Keychain is opt-in** (`up key migrate-to-keychain`); prompts use LocalAuthentication (Touch ID / password). Do **not** claim “Touch ID by default.” If `keyStorage: keychain` and decrypt fails in the IDE, warm with `up run -- true` — never suggest `up init` (new Key-Id).
9. **Never** run `up init --force` without explicit user approval (replaces identity after archive).

## Command reference

| Command | Purpose |
|---------|---------|
| `up status` / `up status --json` | Lock state, keypair, `keyStorage`, `upgradeRecommended`, drift |
| `up init` | Create keypair (`identity.enc` + recovery code; once per machine) |
| `up key upgrade` | Opt-in: recovery + migrate legacy plaintext identity (same Key-Id) |
| `up import .env [--delete]` | Encrypt `.env` → `.env.up` (`--delete` removes plaintext) |
| `up unlock [--duration 15m]` | Decrypt `.env.up` → `.env` with auto-lock timer |
| `up lock [--yes] [--force]` | Delete plaintext `.env` (`--force` discards drift) |
| `up run -- <cmd>` | Inject decrypted env into a process; no `.env` written |
| `up show [KEY]` | Print decrypted value(s) — for the user, never echo in chat |
| `up keys` / `up keys --json` | Key metadata (names, versions) without decrypting |

Exit codes: `0` success, `1` user/usage error, `2` system error.

## Workflows

**Bootstrap a repo:**

```bash
up init                    # once per machine; user must save recovery code
cp .env.example .env       # user fills in real values — do not invent them
up import .env --delete
git add .env.up            # encrypted; safe to commit
```

Commit `.env.example` (key names, no values) and `.env.up`. Keep `.env` and `.env.local` gitignored.

**Add or rotate a secret:**

```bash
up unlock --duration 15m   # writes plaintext .env
# edit .env
up import .env --delete    # refresh .env.up
up lock --yes
```

**Daily development:**

```bash
up run -- npm run dev      # preferred: no plaintext file on disk
# or, if the dev server reads env files from disk (see below):
up unlock --duration 30m && npm run dev
```

## Vite and other file-based bundlers

`up run --` injects `process.env`, but Vite reads `import.meta.env` from `.env*` files on disk. For Vite SPAs, prefer `up unlock` + `.env` over `up run --`.

Vite load order: `.env` → `.env.local` → `.env.[mode]` → `.env.[mode].local` (later overrides earlier). DotEnvUp manages **`.env` only** — consolidate any `.env.local` into `.env`, run `up import .env --delete`, and delete the redundant `.env.local` so it cannot shadow managed values.

## Anti-patterns

- Running `npm test` or similar directly when the app expects env — use `up run --`.
- Secrets under `VITE_` / `NEXT_PUBLIC_` (or any client-bundled prefix).
- Committing `.env` or `.env.local` with real values.
- Asking the user to paste secret values into chat.
- Assuming `.env` exists when `up status` reports locked.

Full automation guide: [AGENTS.md](https://github.com/sarhej/dotenvup/blob/main/AGENTS.md) in the DotEnvUp repo.
