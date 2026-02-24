import * as vscode from 'vscode';
import { getTargetWorkspaceRoot } from '../workspace';

export async function run(workspaceRoot?: string): Promise<void> {
  const root = workspaceRoot ?? (await getTargetWorkspaceRoot()) ?? vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!root) {
    vscode.window.showWarningMessage('DotEnvUp: No workspace folder open.');
    return;
  }
  const { readRecipientsConfig, removeRecipient } = await import('@dotenvup/format');
  const recipients = await readRecipientsConfig(root);
  if (recipients.length === 0) {
    vscode.window.showInformationMessage('DotEnvUp: No additional recipients configured.');
    return;
  }
  const pick = await vscode.window.showQuickPick(
    recipients.map((r) => ({ label: r.label || r.keyId, description: r.keyId, value: r.keyId })),
    { title: 'DotEnvUp: Remove recipient', placeHolder: 'Select recipient to remove' },
  );
  if (!pick) return;
  const ok = await removeRecipient(root, pick.value);
  if (!ok) {
    vscode.window.showWarningMessage(`DotEnvUp: Recipient not found: ${pick.value}`);
    return;
  }
  vscode.window.showInformationMessage(`DotEnvUp: Removed recipient ${pick.label}.`);
}

