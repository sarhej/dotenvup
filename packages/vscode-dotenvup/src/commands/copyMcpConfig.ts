/**
 * DotEnvUp: Copy MCP config for Cursor — copies a JSON snippet so the user can add the DotEnvUp MCP server.
 */

import * as vscode from 'vscode';

const MCP_CONFIG_SNIPPET = `{
  "mcpServers": {
    "dotenvup": {
      "command": "npx",
      "args": ["-y", "@dotenvup/mcp"],
      "cwd": "\${workspaceFolder}"
    }
  }
}`;

export async function run(): Promise<void> {
  await vscode.env.clipboard.writeText(MCP_CONFIG_SNIPPET.trim());
  void vscode.window.showInformationMessage(
    'DotEnvUp: MCP config copied. Paste into Cursor MCP settings (Settings → MCP) or merge the "dotenvup" entry into your mcpServers. Requires: npx -y @dotenvup/mcp',
  );
}
