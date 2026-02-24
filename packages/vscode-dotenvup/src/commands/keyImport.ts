import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import type { ExtensionKeyStore } from '../keystore';
import * as logger from '../logger';

async function promptPassphrase(): Promise<string | null> {
  const value = await vscode.window.showInputBox({
    title: 'DotEnvUp: Import Key',
    prompt: 'Passphrase for key bundle',
    password: true,
    ignoreFocusOut: true,
  });
  return value ?? null;
}

export async function run(keystore: ExtensionKeyStore): Promise<void> {
  const file = await vscode.window.showOpenDialog({
    canSelectMany: false,
    openLabel: 'Import key bundle',
    filters: { 'DotEnvUp Key Bundle': ['dotenvup-key', 'json'], All: ['*'] },
  });
  if (!file?.length) return;

  const content = await fs.readFile(file[0].fsPath, 'utf8');
  const passphrase = await promptPassphrase();
  if (!passphrase) return;

  const { parseKeyBundle, importKeyBundle, keyFingerprint } = await import('@dotenvup/format');
  const bundle = parseKeyBundle(content);
  const imported = await importKeyBundle(bundle, passphrase);
  const incomingKeyId = await keyFingerprint(imported.publicKey);

  const existingPub = await keystore.getPublicKey();
  if (existingPub) {
    const currentKeyId = await keyFingerprint(existingPub);
    if (currentKeyId !== incomingKeyId) {
      const overwrite = await vscode.window.showWarningMessage(
        `Current key (${currentKeyId}) differs from imported (${incomingKeyId}). Overwrite?`,
        { modal: true },
        'Overwrite',
        'Cancel',
      );
      if (overwrite !== 'Overwrite') {
        logger.warn('DotEnvUp: Key import cancelled. Existing keypair preserved.');
        return;
      }
    }
  }

  await keystore.storeKeypair(imported.publicKey, imported.privateKey);
  logger.info(`DotEnvUp: Key imported. Active key id: ${incomingKeyId}`);
}

