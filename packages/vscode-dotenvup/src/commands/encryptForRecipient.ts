import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs/promises';
import type { ExtensionKeyStore } from '../keystore';
import * as logger from '../logger';
import { askRecipientSource, parseRecipientPublicKeyInput } from './recipientsShared';

export async function run(keystore: ExtensionKeyStore, uri?: vscode.Uri): Promise<void> {
  let root: string | null;
  if (uri) {
    root = path.dirname(uri.fsPath);
  } else {
    root = await import('../workspace').then((w) => w.getTargetWorkspaceRoot());
    if (!root) {
      root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? null;
    }
  }
  if (!root) {
    vscode.window.showWarningMessage('DotEnvUp: No workspace folder open.');
    return;
  }

  const envUpPath = path.join(root, '.env.up');
  try {
    await fs.access(envUpPath);
  } catch {
    vscode.window.showErrorMessage('DotEnvUp: No .env.up found in this location. Import a .env first.');
    return;
  }

  const publicKey = await keystore.getPublicKey();
  const privateKey = await keystore.getPrivateKey();
  if (!publicKey || !privateKey) {
    logger.error('DotEnvUp: No keypair found. Run "DotEnvUp: Init" first.');
    return;
  }

  const input = await askRecipientSource();
  if (!input) return;

  let recipientPubKey: Uint8Array;
  try {
    recipientPubKey = await parseRecipientPublicKeyInput(input);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    vscode.window.showErrorMessage(`DotEnvUp: Invalid recipient key: ${msg}`);
    return;
  }

  const label = await vscode.window.showInputBox({
    title: 'DotEnvUp: Recipient label (optional)',
    prompt: 'Example: alice, ci-prod, teammate-laptop',
    ignoreFocusOut: true,
  });
  if (label === undefined) return; // cancelled

  const { addRecipient, keyFingerprint } = await import('@dotenvup/format');
  const entry = await addRecipient(root, recipientPubKey, label || undefined);

  const config = vscode.workspace.getConfiguration('dotenvup');
  if (config.get<boolean>('createBackupBeforeLock', true)) {
    try {
      await fs.copyFile(envUpPath, path.join(root, '.env.up.bak-' + Date.now()));
    } catch {}
  }

  const envPath = path.join(root, '.env');
  let envExists = false;
  try {
    await fs.access(envPath);
    envExists = true;
  } catch {}

  if (envExists) {
    const importCmd = await import('./import');
    const ok = await importCmd.run(keystore, root, { silent: true });
    if (!ok) {
      vscode.window.showErrorMessage('DotEnvUp: Recipient added but re-encryption failed. Run Import manually.');
      return;
    }
  } else {
    try {
      await reencryptLocked(envUpPath, root, keystore);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      vscode.window.showErrorMessage(`DotEnvUp: Recipient added but re-encryption failed: ${msg}`);
      return;
    }
  }

  const recipientId = entry.label || entry.keyId;
  vscode.window.showInformationMessage(
    `DotEnvUp: .env.up is now encrypted for ${recipientId} (${entry.keyId}). They can decrypt with their private key.`,
  );
}

async function reencryptLocked(
  envUpPath: string,
  root: string,
  keystore: ExtensionKeyStore,
): Promise<void> {
  const { parse, decryptAny, create, serialize, resolveRecipientPublicKeys, isSafeToDelete } =
    await import('@dotenvup/format');
  const { getAuthor } = await import('../author');

  const privateKey = await keystore.getPrivateKey();
  const publicKey = await keystore.getPublicKey();
  if (!privateKey || !publicKey) throw new Error('No keypair');

  const content = await fs.readFile(envUpPath, 'utf8');
  const file = parse(content);
  const { entries, raw } = await decryptAny(file, privateKey, '@local');

  if (Object.keys(entries).length === 0) {
    throw new Error('Decrypted .env.up has zero entries — aborting to avoid data loss');
  }

  const author = await getAuthor(keystore.getIdentityDir());
  const recipients = await resolveRecipientPublicKeys(root, publicKey);
  const newFile = await create(entries, author, recipients, raw);
  const serialized = serialize(newFile);

  // Atomic write: temp file then rename to avoid partial writes
  const tmpPath = envUpPath + '.tmp-' + Date.now();
  await fs.writeFile(tmpPath, serialized, 'utf8');

  // Verify the new file is decryptable before replacing the original
  const verification = await isSafeToDelete(tmpPath, privateKey);
  if (!verification.safe) {
    await fs.unlink(tmpPath).catch(() => {});
    throw new Error(`Re-encrypted file failed verification (${verification.reason}). Original .env.up preserved.`);
  }

  await fs.rename(tmpPath, envUpPath);
}
