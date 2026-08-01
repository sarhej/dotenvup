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

## Key initiatives (as of 2026-08-01)

| Initiative | Product | Status |
|------------|---------|--------|
| DotEnvUp — workspace & product map | (workspace-level) | DONE |
| macOS Touch ID Keychain (envelope + session agent) | `cli` | IN_PROGRESS (P0) — M0 DONE, M1 file envelope+recovery in PR |
| Cursor Marketplace plugin listing | `cursor-plugin` | IN_PROGRESS — `@dotenvup/mcp@0.1.0` on npm DONE |
| Homebrew tap for `up` CLI | `cli` | PLANNED (P2, NEXT) — distribution channel, **not** a separate product |
| Extension production hardening | `vscode-extension` | PLANNED |
| Website & edge Worker upkeep | `website` | PLANNED |

Active design: [docs/design/KEYCHAIN_TOUCHID.md](design/KEYCHAIN_TOUCHID.md).

## Related

- Agent automation for DotEnvUp itself: [AGENTS.md](../AGENTS.md)
- User guide: [USER_GUIDE.md](USER_GUIDE.md)
