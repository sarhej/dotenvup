import * as vscode from 'vscode';
import { getTargetWorkspaceRoot } from '../workspace';
import { askRecipientSource, parseRecipientPublicKeyInput } from './recipientsShared';

export async function run(workspaceRoot?: string): Promise<void> {
  const root = workspaceRoot ?? (await getTargetWorkspaceRoot()) ?? vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!root) {
    vscode.window.showWarningMessage('DotEnvUp: No workspace folder open.');
    return;
  }
  const input = await askRecipientSource();
  if (!input) return;
  const label = await vscode.window.showInputBox({
    title: 'DotEnvUp: Recipient label (optional)',
    prompt: 'Example: alice-laptop, ci-prod, backup-key',
    ignoreFocusOut: true,
  });
  try {
    const publicKey = await parseRecipientPublicKeyInput(input);
    const { addRecipient } = await import('@dotenvup/format');
    const entry = await addRecipient(root, publicKey, label || undefined);
    vscode.window.showInformationMessage(`DotEnvUp: Recipient added (${entry.label || entry.keyId}).`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    vscode.window.showErrorMessage(`DotEnvUp: Failed to add recipient: ${msg}`);
  }
}

