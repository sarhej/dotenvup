/**
 * DotEnvUp: Encrypt for GitHub User (standard flow)
 *
 * Adds the GitHub user as a recipient to the project and re-encrypts .env.up
 * so it includes a recipient block for them (FORMAT_SPEC multi-recipient).
 * Share the .env.up file — they can unlock with the key that corresponds to
 * their GitHub SSH public key (e.g. DotEnvUp key or SSH-key decryption).
 * Purely local — GitHub is only used as a public key directory.
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs/promises';
import type { ExtensionKeyStore } from '../keystore';
import { fetchGitHubX25519Keys, addRecipient } from '@dotenvup/format';

export async function run(keystore: ExtensionKeyStore, uri?: vscode.Uri): Promise<void> {
  let root: string | null;
  if (uri) {
    root = path.dirname(uri.fsPath);
  } else {
    root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? null;
  }
  if (!root) {
    vscode.window.showWarningMessage('DotEnvUp: No workspace folder open.');
    return;
  }

  const envUpPath = path.join(root, '.env.up');
  try {
    await fs.access(envUpPath);
  } catch {
    vscode.window.showErrorMessage(
      'DotEnvUp: No .env.up found. Import a .env first, then add the GitHub user as a recipient.',
    );
    return;
  }

  const publicKey = await keystore.getPublicKey();
  const { requirePrivateKeyOrNotify } = await import('../keyErrors');
  const privateKey = await requirePrivateKeyOrNotify(keystore, 'Encrypt for GitHub User');
  if (!publicKey || !privateKey) {
    if (!publicKey) {
      vscode.window.showErrorMessage('DotEnvUp: No public key found. Run "DotEnvUp: Init" only if you have never set up a key.');
    }
    return;
  }

  const usernameInput = await vscode.window.showInputBox({
    title: 'DotEnvUp: Add GitHub user as recipient',
    prompt: 'Enter GitHub username. Their Ed25519 SSH key(s) will be used (github.com/{user}.keys).',
    placeHolder: 'username',
    ignoreFocusOut: true,
  });
  if (usernameInput === undefined) return;
  const username = usernameInput.trim().replace(/^@/, '');
  if (!username) {
    vscode.window.showWarningMessage('DotEnvUp: GitHub username is required.');
    return;
  }

  let keys: { sshKey: string; x25519Pub: Uint8Array }[];
  try {
    keys = await fetchGitHubX25519Keys(username);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    vscode.window.showErrorMessage(`DotEnvUp: Failed to fetch keys for @${username}: ${msg}`);
    return;
  }

  if (keys.length === 0) {
    vscode.window.showErrorMessage(
      `No Ed25519 SSH key found for @${username} on GitHub. They need to add one at github.com/settings/keys.`,
    );
    return;
  }

  let selectedKey: { sshKey: string; x25519Pub: Uint8Array };
  if (keys.length === 1) {
    selectedKey = keys[0];
  } else {
    const keyLabels = keys.map((k) => {
      const b64 = k.sshKey.split(/\s+/)[1] ?? '';
      const short = b64.length > 12 ? `${b64.slice(0, 6)}...${b64.slice(-6)}` : b64;
      return { label: short, detail: k.sshKey.slice(0, 60) + '...', key: k };
    });
    const pick = await vscode.window.showQuickPick(keyLabels, {
      title: 'DotEnvUp: Select which key to encrypt for',
      placeHolder: 'Multiple Ed25519 keys found for @' + username,
      matchOnDetail: true,
    });
    if (!pick) return;
    selectedKey = pick.key;
  }

  const label = `github:${username}`;
  const entry = await addRecipient(root, selectedKey.x25519Pub, label);

  const config = vscode.workspace.getConfiguration('dotenvup');
  if (config.get<boolean>('createBackupBeforeLock', true)) {
    try {
      await fs.copyFile(envUpPath, path.join(root, '.env.up.bak-' + Date.now()));
    } catch {}
  }

  const envPath = path.join(root, '.env');
  const envExists = await fs.access(envPath).then(() => true).catch(() => false);

  if (envExists) {
    const importCmd = await import('./import');
    const ok = await importCmd.run(keystore, root, { silent: true });
    if (!ok) {
      vscode.window.showErrorMessage(
        'DotEnvUp: Recipient added but re-encryption failed. Run Import manually.',
      );
      return;
    }
  } else {
    try {
      const { reencryptLocked } = await import('./reencryptEnvUp');
      await reencryptLocked(envUpPath, root, keystore);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      vscode.window.showErrorMessage(`DotEnvUp: Recipient added but re-encryption failed: ${msg}`);
      return;
    }
  }

  vscode.window.showInformationMessage(
    `DotEnvUp: .env.up is now encrypted for ${label} (${entry.keyId}). Share the .env.up file — they can unlock with their key.`,
  );
}
