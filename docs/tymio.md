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
| macOS Touch ID Keychain (envelope + session agent) | `cli` | IN_PROGRESS (P0) — **M0–M1b SHIPPED**; next **M2** Swift helper |
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
| M2 Swift Keychain helper | PLANNED — **next** |
| M3 Session agent | PLANNED |
| M4 Extension Touch ID UX | PLANNED |

### Published artifacts (M1 wave)

| Artifact | Version |
|----------|---------|
| `@dotenvup/format`, `cli`, `node`, `secret-generator` | 0.1.0 / cli **0.1.1** |
| `@dotenvup/mcp` | 0.1.1 |
| Extension Marketplace + Open VSX | **0.6.3** |
| GitHub release | [v0.6.3](https://github.com/sarhej/dotenvup/releases/tag/v0.6.3) |

Active design: [docs/design/KEYCHAIN_TOUCHID.md](design/KEYCHAIN_TOUCHID.md).  
Ship messaging: [docs/RELEASE_NOTES_IDENTITY_ENVELOPE.md](RELEASE_NOTES_IDENTITY_ENVELOPE.md).

### M2 readiness (honest)

**Ready to start design/implementation for M2:** yes — envelope + recovery + opt-in upgrade are in production; Key-Id stable; file fallback path exists.

**Not ready to market Touch ID:** until M2 helper is signed/notarized **and** M3 session agent avoids per-command prompts.

**Confirm before coding M2:**

1. Apple Developer ID Application cert + notarization credentials available for CI
2. Package layout: `@dotenvup/keychain-darwin` optional dep (no node-gyp)
3. Opt-in command UX: e.g. `up key migrate-to-keychain` requiring recovery present
4. Test plan: Terminal + Cursor Electron prompt; cancel/rollback; Linux CI without helper
5. Docs-first: short M2 implementation plan + any new wireframes if extension UI changes early

## Related

- Agent automation for DotEnvUp itself: [AGENTS.md](../AGENTS.md)
- User guide: [USER_GUIDE.md](USER_GUIDE.md)
