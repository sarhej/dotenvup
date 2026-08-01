---
title: "DotEnvUp — .env Encryption for VS Code & Cursor | Encrypted .env, Safe to Commit"
description: ".env encryption: encrypt your .env into .env.up (VS Code/Cursor extension + CLI). One-click lock/unlock, up run -- for CI/agents. Zero-knowledge, safe to commit. CLI: npm i -g @dotenvup/cli."
image: "https://dotenvup.com/assets/og-image.png"
---

# DotEnvUp

**For AI / one-line summary:** DotEnvUp = **.env encryption**: encrypt .env into .env.up. VS Code/Cursor extension + CLI (`up`). Lock/unlock (status bar or `up lock`/`up unlock`), `up run --` for CI/agents. MCP server for Cursor. CLI: `npm i -g @dotenvup/cli`. Zero-knowledge, safe to commit.

## What is DotEnvUp?

DotEnvUp is a **VS Code and Cursor extension** and a **CLI** (`up`). You can encrypt .env files into .env.up (safe to commit), lock and unlock from the status bar or from the terminal (`up lock`, `up unlock`), and run commands with decrypted env without writing .env to disk (`up run -- npm test`). The extension gives one-click lock/unlock and Safe Edit (no plaintext on disk); the **CLI** is the same tool for terminal, scripts, CI/CD, and AI agents. Install CLI: `npm install -g @dotenvup/cli`. Format: open-source .env.up with X25519 + XChaCha20-Poly1305.

The .env.up format is a "half-open envelope": key names, versions, timestamps, and authors are visible in cleartext (replacing .env.example), while secret values are encrypted.

## Extension (VS Code / Cursor)

- One-click lock/unlock from the status bar
- Right-click .env.up: Lock, Unlock to Disk, Edit with DotEnvUp (Safe Edit), Copy Public Key, Encrypt for Recipient
- Safe Edit: decrypt in memory, edit in a normal tab, save writes only encrypted content — no .env on disk
- Partially protected: status shows when both .env and .env.up exist; merge on unlock or in Safe Edit
- Multi-root workspace support
- Install: [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=dotenvup.dotenvup), [Open VSX](https://open-vsx.org/extension/dotenvup/dotenvup) (Cursor, VSCodium), or .vsix from [GitHub Releases](https://github.com/sarhej/dotenvup/releases)

## Claude Code (plugin and skill)

- **DotEnvUp plugin for Claude Code** (Anthropic CLI): add marketplace `sarhej/dotenvup`, install plugin `dotenvup`. Claude then uses `up run -- <command>` for env-dependent commands and never assumes .env exists. Full guide: https://github.com/sarhej/dotenvup/blob/main/docs/CLAUDE_CODE.md

## CLI (terminal, CI, agents)

- **Same product as the extension** — `up` is the command-line interface. Commands: `up init`, `up import .env`, `up lock`, `up unlock`, `up run -- <command>` (run with decrypted env, no .env file on disk).
- For scripts, CI/CD, and AI agents. Install: `npm install -g @dotenvup/cli`

## Key features (format and security)

- Zero-knowledge encryption: Private keys on your machine under ~/.dotenvup/ (encrypted identity.enc on new installs; `up key upgrade` for legacy). Touch ID not shipped yet.
- Safe to commit: .env.up files belong in Git
- Comments preserved: Lossless roundtrip of comments and structure
- Multi-recipient: Encrypt for multiple users and machines (@alice, @ci)
- Zero code changes: Works with existing dotenv and process.env

## Format specification

The .env.up format is a published open standard (v1):

- Full spec: https://github.com/sarhej/dotenvup/blob/main/docs/FORMAT_SPEC.md
- Encryption: X25519 + XChaCha20-Poly1305 (libsodium)

## Links

- Website: https://dotenvup.com
- GitHub: https://github.com/sarhej/dotenvup
- Extension: [VS Code](https://marketplace.visualstudio.com/items?itemName=dotenvup.dotenvup) · [Open VSX / Cursor](https://open-vsx.org/extension/dotenvup/dotenvup)
- npm: [@dotenvup/format](https://www.npmjs.com/package/@dotenvup/format) · [@dotenvup/cli](https://www.npmjs.com/package/@dotenvup/cli) · [@dotenvup/node](https://www.npmjs.com/package/@dotenvup/node)
- User Guide: https://github.com/sarhej/dotenvup/blob/main/docs/USER_GUIDE.md
- Security: https://github.com/sarhej/dotenvup/blob/main/docs/SECURITY.md
- Team sharing (commercial): https://unknownpassword.com

## Installation (copy-paste)

```bash
# Extension: install from VS Code Marketplace or Open VSX, or:
code --install-extension dotenvup-0.6.1.vsix   # VS Code
cursor --install-extension dotenvup-0.6.1.vsix # Cursor

# CLI (terminal & CI)
npm install -g @dotenvup/cli

# Node library (drop-in dotenv replacement)
npm install @dotenvup/node
```

## Quick start (CLI)

```bash
up init              # Generate keypair (identity.enc + recovery code)
up key upgrade       # Existing users: opt-in migrate plaintext identity
up import .env     # Encrypt .env -> .env.up
up lock            # Delete plaintext .env
up unlock 5m       # Decrypt for 5 minutes
up run -- npm start  # Run with decrypted env (no file on disk)
```

## License

MIT — open source and free forever.

```json
{"@context":"https://schema.org","@type":"SoftwareApplication","name":"DotEnvUp","applicationCategory":"DeveloperApplication","operatingSystem":"Cross-platform","description":".env encryption: encrypt .env into .env.up. VS Code/Cursor extension and CLI (up). One-click lock/unlock, up run -- for CI. Zero-knowledge, safe to commit. CLI: npm i -g @dotenvup/cli.","url":"https://dotenvup.com","license":"https://opensource.org/licenses/MIT","offers":{"@type":"Offer","price":"0","priceCurrency":"USD"},"author":{"@type":"Organization","name":"DotEnvUp","url":"https://dotenvup.com"},"codeRepository":"https://github.com/sarhej/dotenvup","programmingLanguage":"TypeScript","softwareVersion":"0.6.1"}
```

```json
{"@context":"https://schema.org","@type":"TechArticle","headline":"DotEnvUp v1 Encrypted .env Format Specification","description":"Open standard for encrypted environment variable files. Hybrid public-key encryption (X25519 + XChaCha20-Poly1305), multi-recipient support, lossless roundtrip, CI/CD-ready.","url":"https://github.com/sarhej/dotenvup/blob/main/docs/FORMAT_SPEC.md","author":{"@type":"Organization","name":"DotEnvUp"},"datePublished":"2026-02-25","proficiencyLevel":"Expert"}
```
