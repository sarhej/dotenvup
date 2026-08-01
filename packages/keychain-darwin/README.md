# `@dotenvup/keychain-darwin`

Optional macOS helper that stores DotEnvUp’s **identity wrapping key** in the login Keychain with a `UserPresence` ACL (Touch ID, Apple Watch, or login password).

The private identity stays in `~/.dotenvup/identity.enc`. This package never holds the DotEnvUp private key itself.

## Requirements

- macOS 13+
- Prebuilt universal binary `bin/dotenvup-keychain` (built on macOS; signed + notarized for releases)

## Helper CLI

```text
dotenvup-keychain probe
dotenvup-keychain set <account>   # wrapping key on stdin (base64)
dotenvup-keychain get <account>   # prompts; base64 on stdout
dotenvup-keychain has <account>
dotenvup-keychain delete <account>
dotenvup-keychain watch-presence  # stub until M3 session agent
```

## Build locally

```bash
npm run build:helper
# signed + notarized (needs Keychain profile `dotenvup`):
npm run build:helper:release
```

Override binary path: `DOTENVUP_KEYCHAIN_HELPER=/path/to/dotenvup-keychain`.

## Opt-in from CLI

```bash
up key upgrade                 # file envelope + recovery first
up key migrate-to-keychain     # move wrapping key into Keychain
```
