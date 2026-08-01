/**
 * DotEnvUp: Decrypt Sealed File
 *
 * Decrypts a .sealed file (from sealedShareEncrypt) using the local DotEnvUp keypair.
 * Purely local — no server.
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs/promises';
import type { ExtensionKeyStore } from '../keystore';
import { sealedShareDecrypt } from '@dotenvup/format';

export async function run(keystore: ExtensionKeyStore, uri?: vscode.Uri): Promise<void> {
  let sealedUri: vscode.Uri;
  if (uri?.fsPath?.endsWith('.sealed')) {
    sealedUri = uri;
  } else {
    const picked = await vscode.window.showOpenDialog({
      canSelectMany: false,
      openLabel: 'Select .sealed file',
      filters: { 'Sealed files': ['sealed'], All: ['*'] },
    });
    if (!picked?.[0]) return;
    sealedUri = picked[0];
  }

  let ciphertext: string;
  try {
    const raw = await vscode.workspace.fs.readFile(sealedUri);
    ciphertext = new TextDecoder().decode(raw).trim();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    vscode.window.showErrorMessage(`DotEnvUp: Could not read file: ${msg}`);
    return;
  }

  const pubKey = await keystore.getPublicKey();
  const { requirePrivateKeyOrNotify } = await import('../keyErrors');
  const privKey = await requirePrivateKeyOrNotify(keystore, 'Decrypt Sealed File');
  if (!pubKey || !privKey) {
    if (!pubKey) {
      const action = await vscode.window.showErrorMessage(
        'DotEnvUp: No public key found. Run "DotEnvUp: Init" only if you have never set up a key.',
        'Init keypair',
      );
      if (action === 'Init keypair') {
        await vscode.commands.executeCommand('dotenvup.init');
      }
    }
    return;
  }

  let plaintext: string;
  try {
    plaintext = await sealedShareDecrypt(ciphertext, pubKey, privKey);
  } catch {
    vscode.window.showErrorMessage(
      'Could not decrypt. This file was not encrypted for your key.',
    );
    return;
  }

  const action = await vscode.window.showQuickPick(
    [
      { label: 'Save as .env', detail: 'Write to workspace root', value: 'save' as const },
      { label: 'Open as preview', detail: 'View in untitled editor', value: 'preview' as const },
      { label: 'Copy to clipboard', detail: 'Copy decrypted content', value: 'copy' as const },
    ],
    { title: 'DotEnvUp: Decrypted successfully', placeHolder: 'What would you like to do?' },
  );
  if (!action) return;

  if (action.value === 'copy') {
    await vscode.env.clipboard.writeText(plaintext);
    vscode.window.showInformationMessage('DotEnvUp: Decrypted content copied to clipboard.');
    return;
  }

  if (action.value === 'preview') {
    const doc = await vscode.workspace.openTextDocument({ content: plaintext, language: 'dotenv' });
    await vscode.window.showTextDocument(doc, { preview: true });
    return;
  }

  const folders = vscode.workspace.workspaceFolders;
  if (!folders?.length) {
    vscode.window.showErrorMessage('DotEnvUp: No workspace folder open. Open a folder to save .env.');
    return;
  }
  const targetRoot = folders.length === 1 ? folders[0].uri : (await vscode.window.showQuickPick(
    folders.map((f) => ({ label: f.name, description: f.uri.fsPath, root: f.uri })),
    { placeHolder: 'Select folder to save .env' },
  ))?.root;
  if (!targetRoot) return;

  const envPath = vscode.Uri.joinPath(targetRoot, '.env');
  await vscode.workspace.fs.writeFile(envPath, new TextEncoder().encode(plaintext));
  vscode.window.showInformationMessage('DotEnvUp: Saved as .env in workspace root.');
}
