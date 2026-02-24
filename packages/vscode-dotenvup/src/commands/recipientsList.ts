import * as vscode from 'vscode';
import * as path from 'path';
import { getTargetWorkspaceRoot } from '../workspace';

export async function run(workspaceRoot?: string): Promise<void> {
  const root = workspaceRoot ?? (await getTargetWorkspaceRoot()) ?? vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!root) {
    vscode.window.showWarningMessage('DotEnvUp: No workspace folder open.');
    return;
  }
  const { readRecipientsConfig } = await import('@dotenvup/format');
  const recipients = await readRecipientsConfig(root);
  if (recipients.length === 0) {
    vscode.window.showInformationMessage(`DotEnvUp: No additional recipients in ${path.basename(root)}.`);
    return;
  }
  const lines = recipients.map((r) => `${r.label || r.keyId} (${r.keyId})`);
  vscode.window.showInformationMessage(`DotEnvUp recipients:\n${lines.join('\n')}`);
}

