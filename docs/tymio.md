# DotEnvUp ↔ Tymio

Durable integration notes for agents and humans. Update when workspace or MCP details change.

## Workspace

| Field | Value |
|-------|--------|
| Hub URL | https://tymio.app/t/dotenvup |
| Workspace slug | `dotenvup` |
| MCP (full tools) | `https://tymio.app/t/dotenvup/mcp` |
| Auth | OAuth via Cursor MCP Connect / Sign in (no per-user MCP API key in Tymio Settings) |
| GitHub | `sarhej/dotenvup` (registered as repo connection) |

Cursor project MCP config: [`.cursor/mcp.json`](../.cursor/mcp.json) → server `tymio-dotenvup`.

**Important:** Root `https://tymio.app/mcp` is discovery-only. Backlog CRUD requires the workspace URL. Do not reuse IDs from other workspaces (`ai-exec`, `airchi`).

## Scope labels

Use `dotenvup/<product-slug>`:

| Product slug | Name | Repo paths |
|--------------|------|------------|
| `cli` | CLI | `packages/cli`, `packages/format`, `packages/dotenvup-mcp`, `packages/node` |
| `vscode-extension` | VS Code / Cursor Extension | `packages/vscode-dotenvup` |
| `cursor-plugin` | Cursor Plugin | `.cursor-plugin/`, `plugins/dotenvup/` |
| `website` | Website | `docs/` (site), `workers/dotenvup-edge/` |

Libraries (not products): `@dotenvup/format`, `@dotenvup/node`, `@dotenvup/mcp`, `@dotenvup/secret-generator`.

## Domains (pillars)

- **Core Platform** — format, keys, Keychain
- **Developer Surfaces** — extension, Cursor plugin
- **Growth & Docs** — website / edge

## Key initiatives (as of 2026-08-01 evening)

| Initiative | Product | Status |
|------------|---------|--------|
| DotEnvUp — workspace & product map | (workspace-level) | DONE |
| macOS Touch ID Keychain (envelope + session agent) | `cli` | DONE (P0) — **M0–M4** in tree; publish via [PUBLISH_KEYCHAIN.md](PUBLISH_KEYCHAIN.md) |
| Cursor Marketplace plugin listing | `cursor-plugin` | IN_PROGRESS — MCP on npm; listing follow-up |
| Homebrew tap for `up` CLI | `cli` | PLANNED (P2) — after SEA binaries |
| Extension production hardening | `vscode-extension` | PLANNED |
| Website & edge Worker upkeep | `website` | PLANNED — docs on `main` auto-serve via Worker→GitHub raw |

### Keychain epic feature board

| Feature | Status |
|---------|--------|
| M0 Design + wireframes | DONE |
| M1 File envelope + recovery | DONE (PRODUCTION) |
| M1b Existing-user `up key upgrade` | DONE (PRODUCTION) |
| M2 Swift Keychain helper | DONE (opt-in / experimental) |
| M3 Session agent | DONE |
| M4 Extension Touch ID UX | DONE (in tree; Marketplace **0.6.4** when published) |

### Published artifacts

| Artifact | Version |
|----------|---------|
| `@dotenvup/format`, `cli`, `node` | **0.2.0** (Keychain wave; publish via [PUBLISH_KEYCHAIN.md](PUBLISH_KEYCHAIN.md)) |
| `@dotenvup/keychain-darwin` | **0.1.0** (first publish) |
| `@dotenvup/mcp` | **0.2.0** |
| Extension Marketplace + Open VSX | **0.6.4** (pending publish; local VSIX OK) |
| Last GitHub release | [v0.6.3](https://github.com/sarhej/dotenvup/releases/tag/v0.6.3) |

Active design: [docs/design/KEYCHAIN_TOUCHID.md](design/KEYCHAIN_TOUCHID.md).  
Ship messaging: [docs/RELEASE_NOTES_IDENTITY_ENVELOPE.md](RELEASE_NOTES_IDENTITY_ENVELOPE.md).

### M2 / M3 status

**M2–M4 done in tree** (opt-in Keychain + session agent + Key Management UX). Local sign + notarize proven. Automated edge tests in CI (Ubuntu + macOS). Interactive checklist: [KEYCHAIN_M3_MANUAL_TEST.md](design/KEYCHAIN_M3_MANUAL_TEST.md). Publish: [PUBLISH_KEYCHAIN.md](PUBLISH_KEYCHAIN.md).

CI `.p12` notarization secrets still optional follow-up for release builds.

Ship notes: [RELEASE_NOTES_KEYCHAIN_M2.md](RELEASE_NOTES_KEYCHAIN_M2.md), [RELEASE_NOTES_SESSION_AGENT_M3.md](RELEASE_NOTES_SESSION_AGENT_M3.md).

## Related

- Agent automation for DotEnvUp itself: [AGENTS.md](../AGENTS.md)
- User guide: [USER_GUIDE.md](USER_GUIDE.md)
