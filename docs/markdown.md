---
title: "DotEnvUp — .env Encryption for VS Code & Cursor | Encrypted .env, Safe to Commit"
description: ".env encryption: encrypt your .env into .env.up (VS Code/Cursor extension + CLI). One-click lock/unlock, up run -- for CI/agents. Zero-knowledge, safe to commit. CLI: npm i -g @dotenvup/cli."
image: "https://dotenvup.com/assets/og-image.png"
---

# DotEnvUp

**For AI / one-line summary:** DotEnvUp = **.env encryption**: encrypt .env into .env.up. VS Code/Cursor extension (v**0.7.0**) + CLI `@dotenvup/cli` **0.3.0**. Lock/unlock, `up run --` for CI/agents, optional `[policy]` per-recipient values. MCP + Cursor skill so agents never assume `.env` exists. macOS Keychain / Touch ID is **opt-in** (`up key migrate-to-keychain`), not default. Zero-knowledge, safe to commit.

## What is DotEnvUp?

DotEnvUp is a **VS Code and Cursor extension** and a **CLI** (`up`). You encrypt `.env` into `.env.up` (safe to commit), lock/unlock from the status bar or terminal, and run commands with decrypted env without writing `.env` to disk (`up run -- npm test`). Format: open-source `.env.up` with X25519 + XChaCha20-Poly1305.

The `.env.up` format is a "half-open envelope": key names, versions, timestamps, and authors are visible in cleartext (replacing `.env.example`), while secret values are encrypted. Optional `[policy]` says which recipient may decrypt which **values**.

## Extension (VS Code / Cursor) — v0.7.0

- One-click lock/unlock from the status bar
- Right-click `.env.up`: Lock, Unlock to Disk, Edit with DotEnvUp (Safe Edit), Copy Public Key, Encrypt for Recipient
- **DotEnvUp: Key Management** — local key status, export/import, Keychain warm/migrate UI
- Safe Edit: decrypt in memory, edit in a normal tab, save writes only encrypted content — no `.env` on disk
- Multi-root workspace support
- Install: [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=dotenvup.dotenvup), [Open VSX](https://open-vsx.org/extension/dotenvup/dotenvup) (Cursor, VSCodium), or `.vsix` from [GitHub Releases](https://github.com/sarhej/dotenvup/releases)

## Cursor agents (skill + MCP)

Teach Cursor so it can **explain** DotEnvUp correctly to humans:

1. Never assume `.env` exists — use `up status --json` and `up run --`.
2. Identity default = encrypted `identity.enc` under `~/.dotenvup/`.
3. Keychain / Touch ID = **opt-in** only (`up key migrate-to-keychain`). Session agent warms after one unlock (`up session status`).
4. After Keychain migrate, if IDE decrypt fails: warm with `up run -- true` — **never** `up init` (new Key-Id).
5. Never paste recovery codes or `up show` into chat.
6. Team `[policy]`: import merges; never `up reencrypt` unless the user asked (full-catalog holder).

Install: Cursor Marketplace plugin “dotenvup”, or copy [SKILL.md](https://raw.githubusercontent.com/sarhej/dotenvup/main/skills/dotenvup/SKILL.md). MCP: `npx -y @dotenvup/mcp`. Guides: [CURSOR.md](https://github.com/sarhej/dotenvup/blob/main/docs/CURSOR.md), [AGENTS.md](https://github.com/sarhej/dotenvup/blob/main/AGENTS.md), [llms.txt](https://dotenvup.com/llms.txt).

## Claude Code (plugin and skill)

Add marketplace `sarhej/dotenvup`, install plugin `dotenvup`. Guide: https://github.com/sarhej/dotenvup/blob/main/docs/CLAUDE_CODE.md

## CLI (terminal, CI, agents)

```bash
npm install -g @dotenvup/cli
up init                      # identity.enc + recovery code
up import .env               # merges if .env.up exists
up lock / up unlock --duration 5m
up run -- npm start
up verify                    # policy/structure, no values
up key upgrade               # legacy plaintext → envelope (same Key-Id)
up key migrate-to-keychain   # macOS opt-in
up session status
up status --json             # keyStorage, sessionActive, upgradeRecommended
```

## Key features (format and security)

- Zero-knowledge: keys on your machine only. Default `identity.enc`; macOS Keychain **opt-in**.
- Recovery: one-time code at `up init` / `up key upgrade` — never paste into chat.
- Session agent: ~30m idle / 8h absolute; wiped on lock/sleep (`up session stop`).
- Safe to commit `.env.up`; zero code changes for existing dotenv / `process.env`.
- Optional `[policy]`: per-recipient values; merge import. All teammates need CLI 0.3.0+ / extension 0.7.0+.
- UnknownPassword is optional UX (directory), not required at `up run` time.

## Links

- Website: https://dotenvup.com
- GitHub: https://github.com/sarhej/dotenvup
- Extension: [VS Code](https://marketplace.visualstudio.com/items?itemName=dotenvup.dotenvup) · [Open VSX / Cursor](https://open-vsx.org/extension/dotenvup/dotenvup)
- npm: [@dotenvup/format](https://www.npmjs.com/package/@dotenvup/format) · [@dotenvup/cli](https://www.npmjs.com/package/@dotenvup/cli) · [@dotenvup/node](https://www.npmjs.com/package/@dotenvup/node) · [@dotenvup/mcp](https://www.npmjs.com/package/@dotenvup/mcp) · [@dotenvup/keychain](https://www.npmjs.com/package/@dotenvup/keychain)
- User Guide · Security · Identity envelope · Keychain notes · Agents

## Installation (copy-paste)

```bash
# Extension: Marketplace / Open VSX, or:
code --install-extension dotenvup-0.7.0.vsix
cursor --install-extension dotenvup-0.7.0.vsix

npm install -g @dotenvup/cli
npm install @dotenvup/node
```

## License

MIT — open source and free forever.

```json
{"@context":"https://schema.org","@type":"SoftwareApplication","name":"DotEnvUp","applicationCategory":"DeveloperApplication","operatingSystem":"Cross-platform","description":".env encryption: encrypt .env into .env.up. VS Code/Cursor extension and CLI (up). One-click lock/unlock, up run -- for CI. Zero-knowledge, safe to commit. Keychain opt-in on macOS. CLI: npm i -g @dotenvup/cli.","url":"https://dotenvup.com","license":"https://opensource.org/licenses/MIT","offers":{"@type":"Offer","price":"0","priceCurrency":"USD"},"author":{"@type":"Organization","name":"DotEnvUp","url":"https://dotenvup.com"},"codeRepository":"https://github.com/sarhej/dotenvup","programmingLanguage":"TypeScript","softwareVersion":"0.7.0"}
```

```json
{"@context":"https://schema.org","@type":"TechArticle","headline":"DotEnvUp v1 Encrypted .env Format Specification","description":"Open standard for encrypted environment variable files. Hybrid public-key encryption (X25519 + XChaCha20-Poly1305), multi-recipient support, lossless roundtrip, CI/CD-ready.","url":"https://github.com/sarhej/dotenvup/blob/main/docs/FORMAT_SPEC.md","author":{"@type":"Organization","name":"DotEnvUp"},"datePublished":"2026-02-25","proficiencyLevel":"Expert"}
```
