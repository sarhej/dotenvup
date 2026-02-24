/**
 * DotEnvUp: Show Keys — Display key metadata (no decryption)
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs/promises';
import * as logger from '../logger';

export async function run(workspaceRoot?: string): Promise<void> {
  const root = workspaceRoot ?? (await import('../workspace').then((w) => w.getTargetWorkspaceRoot()));
  if (!root) {
    logger.error('DotEnvUp: No workspace folder with .env.up');
    return;
  }

  const envUpPath = path.join(root, '.env.up');
  try {
    await fs.access(envUpPath);
  } catch {
    logger.error('.env.up not found');
    return;
  }

  const { parseHeader } = await import('@dotenvup/format');
  const content = await fs.readFile(envUpPath, 'utf8');
  const header = parseHeader(content);

  const lines = header.keys.map(
    (k) => `${k.name}\tv${k.version}\t${k.updatedAt}\t${k.author}${k.note ? `\t# ${k.note}` : ''}`,
  );
  const text = lines.join('\n');
  const doc = await vscode.workspace.openTextDocument({ content: text, language: 'plaintext' });
  await vscode.window.showTextDocument(doc, { preview: false });
}
