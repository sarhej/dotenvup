# @dotenvup/cli

CLI for `.env.up` — encrypt `.env`, lock/unlock, inject env without writing plaintext (`up run --`).

```bash
npm install -g @dotenvup/cli
```

## Commands

```bash
up init                  # Generate local keypair (~/.dotenvup/)
up import .env           # Encrypt .env → .env.up (merges if .env.up exists)
up lock                  # Delete plaintext .env
up unlock --duration 5m  # Write .env for a limited time
up show                  # Print decrypted values (never log in CI)
up run -- npm start      # Run a command with decrypted env (no .env on disk)
up keys                  # List key names (no decryption)
up status                # Lock state + identity storage
up verify                # Structural + policy checks (no values)
up reencrypt             # Full re-wrap (full-catalog holder only when [policy] present)
up recipients add|list|remove
```

Team files with `[policy]`: merge import, per-recipient payloads, `up verify`. All teammates MUST use this CLI version — older `up import` can wipe secrets other people hold. Guide: [USER_GUIDE.md](https://github.com/sarhej/dotenvup/blob/main/docs/USER_GUIDE.md).

## License

MIT — [dotenvup.com](https://dotenvup.com)
