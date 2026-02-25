/**
 * DotEnvUp: Lock — Delete .env
 * With decrypt-before-delete, drift detection, confirmation, TOCTOU, and file validation.
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs/promises';
import * as logger from '../logger';
import type { ExtensionKeyStore } from '../keystore';

/**
 * Returns true if .env is open in the editor with unsaved changes (dirty).
 * When true, we must NOT delete .env (auto-lock or deactivate) or the user loses the buffer.
 */
export function envFileIsDirty(envPath: string): boolean {
  const normalizedEnv = path.normalize(envPath);
  for (const doc of vscode.workspace.textDocuments) {
    if (doc.uri.scheme !== 'file') continue;
    if (path.normalize(doc.uri.fsPath) === normalizedEnv && doc.isDirty) {
      return true;
    }
  }
  return false;
}

/**
 * Returns true if .env has changes not saved to .env.up (drift).
 * Used by auto-lock and deactivate to avoid deleting .env and losing data.
 * Note: drift is computed from the file on disk; use envFileIsDirty() to catch unsaved editor buffer.
 */
export async function envHasDrift(
  envPath: string,
  envUpPath: string,
  privateKey: Uint8Array,
): Promise<boolean> {
  const { parseEnvFile, entriesMatch, parse, decryptAny } = await import('@dotenvup/format');
  let envContent: string;
  try {
    envContent = await fs.readFile(envPath, 'utf8');
  } catch {
    return false; // no .env or unreadable → no drift
  }
  const envEntries = parseEnvFile(envContent);
  if (Object.keys(envEntries).length === 0) return false;

  let decrypted: Record<string, string>;
  try {
    const content = await fs.readFile(envUpPath, 'utf8');
    const file = parse(content);
    const result = await decryptAny(file, privateKey, '@local');
    decrypted = result.entries;
  } catch {
    return true; // can't decrypt → assume drift, do not delete
  }
  return !entriesMatch(envEntries, decrypted);
}

export interface LockOptions {
  /** Override paths (default: .env and .env.up in root) */
  envPath?: string;
  envUpPath?: string;
  /** When true, skip confirmation dialog (e.g. when called after "Import all" + Lock) */
  skipConfirm?: boolean;
}

export async function run(keystore: ExtensionKeyStore, workspaceRoot?: string, options?: LockOptions): Promise<void> {
  const root = workspaceRoot ?? (await import('../workspace').then((w) => w.getTargetWorkspaceRoot()));
  if (!root) {
    logger.error('DotEnvUp: No workspace folder with .env.up');
    return;
  }
  const envPath = options?.envPath ?? path.join(root, '.env');
  const envUpPath = options?.envUpPath ?? path.join(root, '.env.up');

  try {
    await fs.access(envUpPath);
  } catch {
    logger.error('.env.up not found. Nothing to lock.');
    return;
  }

  try {
    await fs.access(envPath);
  } catch {
    logger.info('.env is already locked');
    return;
  }

  const stat = await fs.stat(envPath);
  if (!stat.isFile()) {
    logger.error('.env is not a file (directory or symlink). Cannot lock.');
    return;
  }

  // --- Lock from buffer (dirty) path: warn, persist buffer to .env.up, delete .env, close tab ---
  if (envFileIsDirty(envPath)) {
    const normalizedEnv = path.normalize(envPath);
    const doc = vscode.workspace.textDocuments.find(
      (d) => d.uri.scheme === 'file' && path.normalize(d.uri.fsPath) === normalizedEnv,
    );
    if (!doc) {
      logger.error('DotEnvUp: .env is dirty but document not found. Save the file first, then lock.');
      return;
    }
    const choice = await vscode.window.showWarningMessage(
      'Lock will save your current editor content to .env.up and remove .env. If you have unaccepted AI or other edits, accept or reject them first. Proceed?',
      'Lock current content',
      'Cancel',
    );
    if (choice !== 'Lock current content') return;

    const bufferContent = doc.getText();
    const { parseEnvFile } = await import('@dotenvup/format');
    const bufferEntries = parseEnvFile(bufferContent);
    if (Object.keys(bufferEntries).length === 0) {
      logger.error('.env has no KEY=VALUE entries to lock.');
      return;
    }

    const lockConfig = vscode.workspace.getConfiguration('dotenvup');
    if (lockConfig.get<boolean>('createBackupBeforeLock', true)) {
      try {
        await fs.copyFile(envUpPath, path.join(path.dirname(envUpPath), path.basename(envUpPath) + '.bak-' + Date.now()));
      } catch {}
    }
    const importCmd = await import('./import');
    const imported = await importCmd.run(keystore, root, {
      silent: true,
      sourcePath: envPath,
      sourceContent: bufferContent,
    });
    if (!imported) {
      logger.error('DotEnvUp: Failed to persist editor content to .env.up. .env preserved.');
      return;
    }
    const privKey = await keystore.getPrivateKey();
    const { isSafeToDelete } = await import('@dotenvup/format');
    const safeCheck = await isSafeToDelete(envUpPath, privKey!);
    if (!safeCheck.safe) {
      logger.error(`DotEnvUp: Verification failed after write (${safeCheck.reason}). .env preserved.`);
      return;
    }
    try {
      await fs.unlink(envPath);
    } catch (e) {
      logger.error('DotEnvUp: Failed to remove .env', e);
      return;
    }
    // Close the .env editor tab so the user doesn't have a stale dirty tab for a deleted file
    const docUri = doc.uri;
    for (const group of vscode.window.tabGroups.all) {
      for (const tab of group.tabs) {
        const input = tab.input as { uri?: vscode.Uri };
        if (input?.uri?.toString() === docUri.toString()) {
          await vscode.window.tabGroups.close(tab);
          break;
        }
      }
    }
    logger.info(`DotEnvUp: Locked from editor — .env removed (${Object.keys(bufferEntries).length} keys)`);
    return;
  }

  // --- Disk path: read from file, then always update .env.up and delete ---
  const { parseEnvFile, entriesMatch } = await import('@dotenvup/format');
  let envContent: string;
  try {
    envContent = await fs.readFile(envPath, 'utf8');
  } catch (e) {
    logger.error('DotEnvUp: Failed to read .env', e);
    return;
  }

  const envEntries = parseEnvFile(envContent);
  if (Object.keys(envEntries).length === 0) {
    logger.error('.env has no KEY=VALUE entries to lock.');
    return;
  }

  let decrypted: Record<string, string> | null = null;
  try {
    let privateKey = await keystore.getPrivateKey();
    if (!privateKey) throw new Error('No keypair. Run DotEnvUp: Init first.');

    const { parse, decryptAny } = await import('@dotenvup/format');
    const envUpContent = await fs.readFile(envUpPath, 'utf8');
    const file = parse(envUpContent);
    const result = await decryptAny(file, privateKey, '@local');
    decrypted = result.entries;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const choice = await vscode.window.showWarningMessage(
      `Cannot decrypt existing .env.up (${msg}). Re-encrypt .env with your current key?`,
      'Re-encrypt and Lock',
      'Cancel',
    );
    if (choice !== 'Re-encrypt and Lock') return;

    const importCmd = await import('./import');
    const imported = await importCmd.run(keystore, root, { silent: true });
    if (!imported) {
      logger.error('DotEnvUp: Re-import failed. .env preserved.');
      return;
    }

    try {
      const privKey = await keystore.getPrivateKey();
      const { isSafeToDelete } = await import('@dotenvup/format');
      const safeCheck = await isSafeToDelete(envUpPath, privKey);
      if (!safeCheck.safe) {
        logger.error(`DotEnvUp: Re-import wrote .env.up but verification failed (${safeCheck.reason}). .env preserved.`);
        return;
      }
    } catch {
      logger.error('DotEnvUp: Verification after re-import failed. .env preserved.');
      return;
    }

    const lockConfig = vscode.workspace.getConfiguration('dotenvup');
    if (lockConfig.get<boolean>('createBackupBeforeLock', true)) {
      try {
        await fs.copyFile(envUpPath, path.join(path.dirname(envUpPath), path.basename(envUpPath) + '.bak-' + Date.now()));
      } catch {}
    }
    try {
      await fs.unlink(envPath);
      logger.info(`DotEnvUp: Re-encrypted and locked — .env removed (${Object.keys(envEntries).length} keys)`);
    } catch (e) {
      logger.error('DotEnvUp: Failed to remove .env', e);
    }
    return;
  }

  // Always update .env.up from disk then delete (no drift prompt; backup is the safety net)
  const config = vscode.workspace.getConfiguration('dotenvup');
  const confirmOnLock = !options?.skipConfirm && config.get<boolean>('confirmOnLock', true);
  if (confirmOnLock) {
    const keyCount = Object.keys(envEntries).length;
    const choice = await vscode.window.showInformationMessage(
      `About to delete .env (${keyCount} keys). Proceed?`,
      'Proceed',
      'Cancel',
      "Don't ask again",
    );
    if (choice === 'Cancel' || choice === undefined) return;
    if (choice === "Don't ask again") {
      await config.update('confirmOnLock', false, vscode.ConfigurationTarget.Global);
    }
  }

  const lockConfig = vscode.workspace.getConfiguration('dotenvup');
  if (lockConfig.get<boolean>('createBackupBeforeLock', true)) {
    try {
      await fs.copyFile(envUpPath, path.join(path.dirname(envUpPath), path.basename(envUpPath) + '.bak-' + Date.now()));
    } catch {}
  }
  const importCmd = await import('./import');
  const imported = await importCmd.run(keystore, root, { silent: true });
  if (!imported) {
    logger.error('DotEnvUp: Import failed. .env preserved.');
    return;
  }

  const recheckContent = await fs.readFile(envPath, 'utf8');
  const recheckEntries = parseEnvFile(recheckContent);
  if (!entriesMatch(recheckEntries, envEntries)) {
    logger.error('File changed during lock. Run lock again.');
    return;
  }

  const privateKeyFinal = await keystore.getPrivateKey();
  const { isSafeToDelete } = await import('@dotenvup/format');
  const safeCheck = await isSafeToDelete(envUpPath, privateKeyFinal!);
  if (!safeCheck.safe) {
    logger.error(`DotEnvUp: BLOCKED deletion — safety check failed: ${safeCheck.reason}`);
    return;
  }

  try {
    await fs.unlink(envPath);
    logger.info(`DotEnvUp: Locked — .env removed (${Object.keys(envEntries).length} keys)`);
  } catch (e) {
    logger.error('DotEnvUp: Failed to remove .env', e);
  }
}
