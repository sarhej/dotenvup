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
 * Returns true if .env has changes not saved to .env.up (drift).
 * Used by auto-lock and deactivate to avoid deleting .env and losing data.
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

function formatDiffSummary(diff: { added: string[]; removed: string[]; changed: string[] }): string {
  const parts: string[] = [];
  if (diff.added.length) parts.push(`+${diff.added.length} new`);
  if (diff.removed.length) parts.push(`-${diff.removed.length} removed`);
  if (diff.changed.length) parts.push(`${diff.changed.length} changed`);
  return parts.join(', ') || 'diff';
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

  const { parseEnvFile, entriesMatch, entriesDiff } = await import('@dotenvup/format');
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

  const hasDrift = !entriesMatch(envEntries, decrypted!);
  if (hasDrift) {
    const diff = entriesDiff(decrypted, envEntries);
    const summary = formatDiffSummary(diff);
    const choice = await vscode.window.showWarningMessage(
      `Your .env has changes not saved to .env.up (${summary}). Save them and lock?`,
      'Save to .env.up & Lock',
      'Cancel',
    );
    if (choice !== 'Save to .env.up & Lock') {
      return;
    }
    const importCmd = await import('./import');
    const imported = await importCmd.run(keystore, root, { silent: true });
    if (!imported) {
      logger.error('DotEnvUp: Import failed. .env preserved.');
      return;
    }
    return run(keystore, root, { skipConfirm: true });
  }

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

  const recheckContent = await fs.readFile(envPath, 'utf8');
  const recheckEntries = parseEnvFile(recheckContent);
  if (!entriesMatch(recheckEntries, envEntries)) {
    logger.error('File changed during lock. Run lock again.');
    return;
  }

  // FINAL SAFETY GATE: verify .env.up is still decryptable right before deletion
  const privateKeyFinal = await keystore.getPrivateKey();
  const { isSafeToDelete } = await import('@dotenvup/format');
  const safeCheck = await isSafeToDelete(envUpPath, privateKeyFinal);
  if (!safeCheck.safe) {
    logger.error(`DotEnvUp: BLOCKED deletion — safety check failed: ${safeCheck.reason}`);
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
    logger.info(`DotEnvUp: Locked — .env removed (${Object.keys(envEntries).length} keys)`);
  } catch (e) {
    logger.error('DotEnvUp: Failed to remove .env', e);
  }
}
