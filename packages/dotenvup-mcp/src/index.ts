#!/usr/bin/env node
/**
 * DotEnvUp MCP server — exposes status, keys, and run (with decrypted env) as MCP tools.
 * Uses the DotEnvUp CLI under the hood; no decrypted values are ever returned.
 */

import * as path from 'path';
import { spawn } from 'child_process';
import { createRequire } from 'module';
import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

const require = createRequire(import.meta.url);

// Resolve CLI bin path so we can run "up" from the same dependency tree
function getCliBinPath(): string {
  const cliRoot = path.dirname(require.resolve('@dotenvup/cli/package.json'));
  const pkg = require('@dotenvup/cli/package.json') as { bin: Record<string, string> };
  const binRel = pkg.bin?.up ?? pkg.bin?.dotenvup ?? './dist/bin.js';
  return path.join(cliRoot, binRel.replace(/^\.\//, ''));
}

async function runUp(args: string[], cwd: string): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const bin = getCliBinPath();
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [bin, ...args], {
      cwd: cwd || process.cwd(),
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout?.on('data', (chunk) => { stdout += chunk; });
    child.stderr?.on('data', (chunk) => { stderr += chunk; });
    child.on('close', (code, signal) => {
      resolve({
        stdout: stdout.trim(),
        stderr: stderr.trim(),
        exitCode: code ?? (signal ? 1 : 0),
      });
    });
  });
}

async function main(): Promise<void> {
  const server = new McpServer({
    name: 'dotenvup',
    version: '0.1.0',
  });

  const dirSchema = z.object({ directory: z.string().optional() });
  const runSchema = z.object({
    command: z.string().describe('Command to run with decrypted env (e.g. "npm test" or "npm run build")'),
    directory: z.string().optional().describe('Workspace directory (default: server cwd)'),
  });

  server.registerTool(
    'dotenvup_status',
    {
      title: 'DotEnvUp status',
      description: 'Get lock state, .env.up presence, keypair, keyStorage, sessionActive / sessionIdleExpiresIn, Keychain flags, key count, stale count, and drift. No secrets returned. Prefer checking sessionActive before dotenvup_run when keyStorage is keychain.',
      inputSchema: dirSchema,
    },
    async ({ directory }) => {
      const cwd = directory || process.cwd();
      const { stdout, stderr, exitCode } = await runUp(['status', '--json'], cwd);
      if (exitCode !== 0) {
        return {
          content: [{ type: 'text', text: stderr || stdout || `up status exited with ${exitCode}` }],
          isError: true,
        };
      }
      return {
        content: [{ type: 'text', text: stdout }],
        structuredContent: JSON.parse(stdout || '{}'),
      };
    }
  );

  server.registerTool(
    'dotenvup_keys',
    {
      title: 'DotEnvUp keys (metadata only)',
      description: 'List key names, versions, timestamps, and authors from .env.up. No decrypted values.',
      inputSchema: dirSchema,
    },
    async ({ directory }) => {
      const cwd = directory || process.cwd();
      const { stdout, stderr, exitCode } = await runUp(['keys', '--json'], cwd);
      if (exitCode !== 0) {
        return {
          content: [{ type: 'text', text: stderr || stdout || `up keys exited with ${exitCode}` }],
          isError: true,
        };
      }
      return {
        content: [{ type: 'text', text: stdout }],
        structuredContent: JSON.parse(stdout || '[]'),
      };
    }
  );

  server.registerTool(
    'dotenvup_run',
    {
      title: 'Run command with DotEnvUp env',
      description: 'Run a command with decrypted env vars (same as "up run -- <command>"). Does NOT return stdout/stderr to avoid leaking secrets; only exit code and success/failure.',
      inputSchema: runSchema,
    },
    async ({ command, directory }) => {
      const cwd = directory || process.cwd();
      // Split command on spaces; user can pass "npm test" or "npm run build"
      const parts = command.trim().split(/\s+/).filter(Boolean);
      if (parts.length === 0) {
        return {
          content: [{ type: 'text', text: 'command is required' }],
          isError: true,
        };
      }
      const { stdout, stderr, exitCode } = await runUp(['run', '--', ...parts], cwd);
      const success = exitCode === 0;
      const summary = success
        ? `Command exited with code 0. (Stdout/stderr not included to avoid leaking secrets.)`
        : `Command exited with code ${exitCode}. (Stdout/stderr not included to avoid leaking secrets.)`;
      return {
        content: [{ type: 'text', text: summary }],
        structuredContent: { exitCode, success },
      };
    }
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  // Log to stderr only (stdio is used for MCP)
  console.error('DotEnvUp MCP server error:', err);
  process.exit(1);
});
