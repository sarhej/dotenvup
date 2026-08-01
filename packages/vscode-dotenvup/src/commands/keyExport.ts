import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import * as path from 'path';
import type { ExtensionKeyStore } from '../keystore';
import * as logger from '../logger';

async function promptPassphrase(): Promise<string | null> {
  const passphrase = await vscode.window.showInputBox({
    title: 'DotEnvUp: Export Key',
    prompt: 'Passphrase to encrypt exported key bundle (min 8 chars)',
    password: true,
    ignoreFocusOut: true,
  });
  if (!passphrase) return null;
  const confirm = await vscode.window.showInputBox({
    title: 'DotEnvUp: Export Key',
    prompt: 'Confirm passphrase',
    password: true,
    ignoreFocusOut: true,
  });
  if (!confirm || confirm !== passphrase) {
    logger.error('Passphrases do not match.');
    return null;
  }
  return passphrase;
}

export async function run(keystore: ExtensionKeyStore): Promise<void> {
  const publicKey = await keystore.getPublicKey();
  const { requirePrivateKeyOrNotify } = await import('../keyErrors');
  const privateKey = await requirePrivateKeyOrNotify(keystore, 'Export Key');
  if (!publicKey || !privateKey) {
    if (!publicKey) logger.error('DotEnvUp: No public key found. Run "DotEnvUp: Init" only if you have never set up a key.');
    return;
  }

  const passphrase = await promptPassphrase();
  if (!passphrase) return;

  const { exportKeyBundle } = await import('@dotenvup/format');
  const bundle = await exportKeyBundle({ publicKey, privateKey }, passphrase);
  const target = await vscode.window.showSaveDialog({
    saveLabel: 'Export key bundle',
    defaultUri: vscode.Uri.file(path.join(keystore.getIdentityDir(), `dotenvup-key-${bundle.keyId}.dotenvup-key`)),
    filters: { 'DotEnvUp Key Bundle': ['dotenvup-key'], 'JSON': ['json'] },
  });
  if (!target) return;

  await fs.writeFile(target.fsPath, JSON.stringify(bundle, null, 2) + '\n', { mode: 0o600 });
  logger.info(`DotEnvUp: Key exported to ${target.fsPath}`);
}

