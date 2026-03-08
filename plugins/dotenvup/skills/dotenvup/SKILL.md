---
name: dotenvup
description: Use when the project uses DotEnvUp (.env.up). Never assume .env exists; run env-dependent commands via `up run -- <command>` (e.g. up run -- npm test). Check state with `up status` or `up status --json`.
---

# DotEnvUp: env and commands

This project uses DotEnvUp: secrets live in `.env.up` (encrypted). The plaintext `.env` may not exist (locked).

- **Never assume `.env` exists.** Before running tests, build, or start, check with `up status` (or `up status --json`).
- **When a command needs environment variables**, run it via: `up run -- <command>`. Examples:
  - `up run -- npm test`
  - `up run -- npm run build`
  - `up run -- npm start`
- **Do not** run `npm test` or similar directly if the app expects env from `.env` — use `up run --` so env is injected without writing `.env` to disk.
- **Editing secrets:** `up unlock` → edit `.env` → `up import .env` → `up lock`.

Full automation guide: [AGENTS.md](https://github.com/sarhej/dotenvup/blob/main/AGENTS.md) in the DotEnvUp repo.
