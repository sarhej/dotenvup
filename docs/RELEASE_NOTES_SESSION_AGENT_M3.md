# Release notes — Session agent (M3)

> After one Touch ID / password unlock, DotEnvUp keeps the private key in an in-memory agent so the rest of your work session stays smooth.

## What shipped

1. Detached agent process (`packages/format` `sessionAgentMain`) on `$TMPDIR/dotenvup-agent-<uid>.sock` + cookie (mode `0600`).
2. Auto-spawn on first successful Keychain unwrap; `put` / `get` / `status` / `stop` NDJSON protocol.
3. TTLs: idle **30m** (reset on use), absolute **8h** (cap 12h). Env: `DOTENVUP_SESSION_IDLE_TTL`, `DOTENVUP_SESSION_ABSOLUTE_TTL`, `DOTENVUP_SESSION_TTL`.
4. `watch-presence` in `@dotenvup/keychain-darwin` — wipe on screen lock, sleep, logout/power-off.
5. CLI: `up session status|stop`; `up status --json` includes `sessionActive`.

## Non-interactive contract

When `DOTENVUP_NO_PROMPT=1`, `CI=true`, or stdin is not a TTY:

1. `UP_KEY` / `DOTENVUP_PRIVATE_KEY` if set  
2. Else warm session agent if active  
3. Else exit `1` — do not prompt  

## Honest limits

- Warm session serves any same-UID local process (ssh-agent class of trust).
- Screen-lock wipe depends on Darwin notifications reaching the helper.
- Disable agent: `DOTENVUP_NO_SESSION=1`.

Design: [design/KEYCHAIN_TOUCHID.md](design/KEYCHAIN_TOUCHID.md).
