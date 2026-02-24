/**
 * DotEnvUp: Import — Convert .env to .env.up
 *
 * When workspaceRoot is provided and a .env exists there, auto-detects it
 * (no file picker). When called from Command Palette (no workspaceRoot),
 * falls back to file picker for advanced use.
 *
 * Options:
 *   silent — suppress "Delete source .env" prompt (used by protect flow)
 */

import * as vscode from 'vscode';
import * as path from 'path';
import type { ExtensionKeyStore } from '../keystore';
import * as logger from '../logger';

export interface ImportOptions {
  /** When true, skip "delete source .env?" prompt (protect flow handles it) */
  silent?: boolean;
  /** When set, use this file as source; output path = same dir + basename + ".up" (e.g. .env.local → .env.local.up) */
  sourcePath?: string;
}

export async function run(keystore: ExtensionKeyStore, workspaceRoot?: string, options?: ImportOptions): Promise<boolean> {
  const wsFolder = vscode.workspace.workspaceFolders?.[0];
  const rootDir = workspaceRoot ?? wsFolder?.uri.fsPath;
  if (!rootDir) {
    logger.error('DotEnvUp: No workspace folder open');
    return false;
  }

  const publicKey = await keystore.getPublicKey();
  if (!publicKey) {
    logger.error('DotEnvUp: No keypair. Run "DotEnvUp: Init" first.');
    return false;
  }

  const fs = await import('fs/promises');
  let srcPath: string;
  let autoDetected = false;

  if (options?.sourcePath) {
    srcPath = options.sourcePath;
    try {
      const stat = await fs.lstat(srcPath);
      if (!stat.isFile() || stat.isSymbolicLink()) {
        logger.error('DotEnvUp: sourcePath is not a regular file.');
        return false;
      }
    } catch {
      logger.error('DotEnvUp: Cannot read sourcePath.');
      return false;
    }
    autoDetected = true;
  } else {
    // Auto-detect: if workspace root has .env, use it directly (no file picker)
    const autoEnvPath = path.join(rootDir, '.env');
    try {
      const stat = await fs.lstat(autoEnvPath);
      if (stat.isFile() && !stat.isSymbolicLink()) {
        srcPath = autoEnvPath;
        autoDetected = true;
      } else {
        srcPath = '';
      }
    } catch {
      srcPath = '';
    }
  }

  if (!autoDetected) {
    const uris = await vscode.window.showOpenDialog({
      defaultUri: wsFolder?.uri,
      canSelectMany: false,
      openLabel: 'Select .env file',
      filters: { 'Env files': ['env'], 'All': ['*'] },
    });
    if (!uris?.length) return false;
    srcPath = uris[0].fsPath;

    const srcStat = await fs.lstat(srcPath);
    if (srcStat.isSymbolicLink()) {
      logger.error('DotEnvUp: Refusing to import a symlink. Select a regular file.');
      return false;
    }
  }

  let content: string;
  try {
    const buf = await fs.readFile(srcPath);
    content = new TextDecoder('utf-8', { fatal: true }).decode(buf);
  } catch (e) {
    logger.error('DotEnvUp: File is not valid UTF-8.');
    return false;
  }

  const { parseEnvFile } = await import('@dotenvup/format');
  const entries = parseEnvFile(content);
  if (Object.keys(entries).length === 0) {
    logger.warn('DotEnvUp: No valid KEY=VALUE entries found');
    return false;
  }

  const dir = path.dirname(srcPath);
  const outPath = path.join(dir, path.basename(srcPath) + '.up');
  try {
    await fs.access(outPath);
    if (!options?.silent) {
      const overwrite = await vscode.window.showWarningMessage(
      `${path.basename(outPath)} already exists. Overwrite?`,
      'Overwrite',
      'Cancel',
    );
      if (overwrite !== 'Overwrite') return false;
    }
  } catch {
    // output file does not exist, proceed
  }

  const { getAuthor } = await import('../author');
  const author = await getAuthor(keystore.getIdentityDir());
  const { create, serialize, resolveRecipientPublicKeys } = await import('@dotenvup/format');
  const recipientPublicKeys = await resolveRecipientPublicKeys(path.dirname(srcPath), publicKey);
  const file = await create(entries, author, recipientPublicKeys, content);
  const output = serialize(file);
  await fs.writeFile(outPath, output, 'utf8');

  // Verify the written .env.up is decryptable before offering to delete source
  const privateKey = await keystore.getPrivateKey();
  const { isSafeToDelete } = await import('@dotenvup/format');
  const safeCheck = await isSafeToDelete(outPath, privateKey);
  if (!safeCheck.safe) {
    logger.error(`DotEnvUp: Import wrote ${path.basename(outPath)} but verification failed (${safeCheck.reason}). Source preserved.`);
    return false;
  }

  if (!options?.silent) {
    const deleteSource = await vscode.window.showInformationMessage(
      `Imported ${Object.keys(entries).length} keys to ${path.basename(outPath)} (verified decryptable)`,
      'Delete source',
      'Keep',
    );
    if (deleteSource === 'Delete source' && srcPath !== outPath) {
      await fs.unlink(srcPath);
      logger.info(`DotEnvUp: Deleted source ${srcPath}`);
    } else {
      logger.info(`DotEnvUp: Imported ${Object.keys(entries).length} keys to ${outPath}`);
    }
  } else {
    logger.info(`DotEnvUp: Imported ${Object.keys(entries).length} keys to ${outPath}`);
  }
  return true;
}
