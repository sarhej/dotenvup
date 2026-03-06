# @dotenvup/mcp

MCP (Model Context Protocol) server for **DotEnvUp**. Lets AI assistants (Cursor, etc.) check lock state, list key metadata, and run commands with decrypted env — **without ever returning secrets** over the wire.

## Tools

| Tool | Description |
|------|-------------|
| `dotenvup_status` | Lock state, `.env.up` presence, keypair, key count, stale count, drift (JSON). |
| `dotenvup_keys` | Key names, versions, timestamps, authors — metadata only, no values. |
| `dotenvup_run` | Run a command with decrypted env (same as `up run -- <cmd>`). Returns only exit code/success; stdout/stderr are not returned to avoid leaking secrets. |

## Install

From the DotEnvUp monorepo (after `npm install` and `npm run build`):

```bash
node packages/dotenvup-mcp/dist/index.js
```

Or install the package (when published):

```bash
npm install -g @dotenvup/mcp
dotenvup-mcp
```

## Cursor MCP config

Add to your Cursor MCP settings (e.g. **Settings → MCP** or `.cursor/mcp.json` depending on your setup) so the AI can use DotEnvUp:

```json
{
  "mcpServers": {
    "dotenvup": {
      "command": "node",
      "args": ["/absolute/path/to/dotenvup/packages/dotenvup-mcp/dist/index.js"],
      "cwd": "${workspaceFolder}"
    }
  }
}
```

Or with `npx` from a project that has `@dotenvup/mcp` as a dependency:

```json
{
  "mcpServers": {
    "dotenvup": {
      "command": "npx",
      "args": ["-y", "@dotenvup/mcp"],
      "cwd": "${workspaceFolder}"
    }
  }
}
```

**Important:** `cwd` must be the workspace (project) root so that `up status`, `up keys`, and `up run` see the correct `.env.up` / `.env`.

## Design

See [docs/design/MCP_SERVER.md](../../docs/design/MCP_SERVER.md) for architecture, security, and extension integration.
