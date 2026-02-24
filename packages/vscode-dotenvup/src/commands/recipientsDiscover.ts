import * as vscode from 'vscode';
import * as os from 'os';
import * as path from 'path';
import { getTargetWorkspaceRoot } from '../workspace';

export async function run(workspaceRoot?: string): Promise<void> {
  const root = workspaceRoot ?? (await getTargetWorkspaceRoot()) ?? vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!root) {
    vscode.window.showWarningMessage('DotEnvUp: No workspace folder open.');
    return;
  }
  const mode = await vscode.window.showQuickPick(
    [
      { label: 'Quick scan', value: 'quick' },
      { label: 'Deep scan (home)', value: 'deep' },
    ],
    { title: 'DotEnvUp: Discover recipient keys', placeHolder: 'Choose scan scope' },
  );
  if (!mode) return;

  const { discoverLocalKeyCandidates } = await import('@dotenvup/format');
  const roots = mode.value === 'deep'
    ? [os.homedir()]
    : [root, path.join(os.homedir(), '.dotenvup'), path.join(os.homedir(), 'Desktop'), path.join(os.homedir(), 'Documents'), path.join(os.homedir(), 'Downloads')];
  const summary = await discoverLocalKeyCandidates({
    roots,
    maxDepth: mode.value === 'deep' ? 12 : 6,
    maxFiles: mode.value === 'deep' ? 50000 : 6000,
  });
  const candidates = summary.results.filter((r) => r.status === 'candidate');
  if (candidates.length === 0) {
    vscode.window.showWarningMessage(`DotEnvUp: No recipient key candidates found (${summary.scannedFiles} files scanned).`);
    return;
  }
  const pick = await vscode.window.showQuickPick(
    candidates.map((c) => ({ label: `${c.type} (${c.keyId})`, description: c.path, value: c })),
    { title: 'DotEnvUp: Key candidates', placeHolder: 'Pick a candidate to add as recipient' },
  );
  if (!pick) return;

  if (pick.value.type === 'identity-private') {
    vscode.window.showWarningMessage('DotEnvUp: Private identity found. Use "Add Recipient" with a public key or bundle file.');
    return;
  }

  const label = await vscode.window.showInputBox({
    title: 'DotEnvUp: Recipient label (optional)',
    prompt: 'Example: teammate-laptop',
    ignoreFocusOut: true,
  });

  try {
    const { addRecipient } = await import('@dotenvup/format');
    if (pick.value.type === 'key-bundle') {
      const fsP = await import('fs/promises');
      const raw = await fsP.readFile(pick.value.path, 'utf8');
      const { parseKeyBundle } = await import('@dotenvup/format');
      const bundle = parseKeyBundle(raw);
      const pub = new Uint8Array(Buffer.from(bundle.publicKey, 'base64'));
      const added = await addRecipient(root, pub, label || undefined);
      vscode.window.showInformationMessage(`DotEnvUp: Recipient added (${added.label || added.keyId}).`);
      return;
    }
    const fsP = await import('fs/promises');
    const raw = (await fsP.readFile(pick.value.path, 'utf8')).trim();
    const pub = new Uint8Array(Buffer.from(raw, 'base64'));
    if (pub.length !== 32) throw new Error('Candidate public key is not 32 bytes.');
    const added = await addRecipient(root, pub, label || undefined);
    vscode.window.showInformationMessage(`DotEnvUp: Recipient added (${added.label || added.keyId}).`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    vscode.window.showErrorMessage(`DotEnvUp: Failed to add discovered recipient: ${msg}`);
  }
}

