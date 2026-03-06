# DotEnvUp MCP Server — Design

> **Goal:** Let AI assistants (Cursor, etc.) use DotEnvUp via the Model Context Protocol (MCP) **locally**, without exposing secrets. The extension and the MCP server work together so "DotEnvUp via MCP" is a first-class option.

## Why MCP?

- **Discovery:** Another agent correctly said "DotEnvUp can't be used via MCP" because there was no MCP server. Adding one fixes that.
- **Automation:** Agents can check lock state, list key metadata, and run commands with decrypted env without leaving the IDE.
- **Same keys:** The MCP server uses the same CLI (and thus `~/.dotenvup/identity`) as the extension and terminal.

## Architecture

1. **New package: `@dotenvup/mcp`** (or `dotenvup-mcp` in repo as `packages/dotenvup-mcp`)
   - Standalone MCP server that speaks stdio (JSON-RPC 2.0).
   - Uses the **CLI** under the hood (`up status --json`, `up keys --json`, `up run -- ...`) so key storage and behavior stay identical to the extension and terminal.
   - Can be run by Cursor (or any MCP client) as a subprocess: `npx @dotenvup/mcp` or `node path/to/dotenvup-mcp/dist/index.js`, with `cwd` set to the workspace root.

2. **Extension integration**
   - **Option A (recommended for v1):** Extension contributes a command or setting that helps the user add the MCP server to Cursor:
     - e.g. **"DotEnvUp: Copy MCP config for Cursor"** — copies a JSON snippet the user can paste into Cursor’s MCP settings so the DotEnvUp MCP server is used for the workspace.
   - **Option B (future):** If Cursor/VS Code ever support "extension-provided MCP", the extension could spawn the MCP server and register it automatically.

3. **Security**
   - **No decrypted values over MCP.** Tools return only:
     - Lock state, key count, drift, keypair presence (`status`).
     - Key names, versions, timestamps, authors (`keys`) — metadata only.
     - For `run`: exit code (and optionally a note that stdout/stderr are not returned to avoid leaking secrets).
   - The `run` tool runs `up run -- <command>` in a **subprocess** with captured stdio so the MCP protocol stream is not corrupted; we do **not** return command output to the agent by default (it could contain secrets).

## MCP Tools

| Tool | Description | Input | Output |
|------|-------------|--------|--------|
| `dotenvup_status` | Lock state, .env.up presence, keypair, key count, stale count, drift | Optional `directory` (default: server cwd) | JSON: `locked`, `hasEnvUp`, `hasKeypair`, `keyCount`, `staleCount`, `drift` |
| `dotenvup_keys` | Key metadata (names, versions, timestamps, authors) — no values | Optional `directory` | JSON array of key metadata |
| `dotenvup_run` | Run a command with decrypted env (same as `up run -- <cmd>`). Does **not** return stdout/stderr to avoid leaking secrets. | `command` (string; will be split for shell, or array of args), optional `directory` | JSON: `exitCode`, `success` (boolean) |

- **Workspace/cwd:** The MCP server is typically started with the workspace root as cwd. Cursor may pass workspace path via env (e.g. `DOTENVUP_WORKSPACE`) or the server uses `process.cwd()`. We support an optional `directory` argument so the client can query a specific folder in multi-root setups.

## Implementation Notes

- **CLI dependency:** The MCP package depends on `@dotenvup/cli` and invokes the `up` binary from `node_modules/.bin/up` (or `npx up`) so the server works even when the CLI is not installed globally. When running, set `cwd` to the target directory so `up` finds `.env.up` there.
- **Stdio:** MCP uses stdin/stdout for JSON-RPC. Any `up run` that we trigger must **not** use `stdio: 'inherit'` when we run it from the same process; we spawn a child that runs `up run -- ...` with `stdio: ['ignore','pipe','pipe']` and only use the exit code (and optionally truncated non-secret output).
- **SDK:** Use `@modelcontextprotocol/sdk` (v1) with `StdioServerTransport` for maximum compatibility. Peer dependency: `zod`.

## User Flow

1. User installs the DotEnvUp extension (or only the CLI).
2. User installs/runs the DotEnvUp MCP server (e.g. `npx @dotenvup/mcp` in Cursor’s MCP config).
3. In Cursor MCP settings, user adds something like:
   ```json
   "dotenvup": {
     "command": "npx",
     "args": ["-y", "@dotenvup/mcp"],
     "cwd": "${workspaceFolder}"
   }
   ```
   Or the extension command copies this snippet.
4. Agent can then call `dotenvup_status`, `dotenvup_keys`, and `dotenvup_run` when the user asks about env or wants to run tests with secrets.

## Backlog / README

- Move "MCP (Model Context Protocol)" from backlog into "Implemented" or "In progress" once this package ships.
- Document in AGENTS.md: "For MCP: add the DotEnvUp MCP server to your Cursor MCP config; see docs/design/MCP_SERVER.md and package @dotenvup/mcp."
