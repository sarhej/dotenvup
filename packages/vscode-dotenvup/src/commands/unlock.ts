/**
 * DotEnvUp: Unlock — Decrypt .env.up, write .env, start auto-lock timer
 * With overwrite protection, atomic write, key-id validation, and duration from settings.
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs/promises';
import type { ExtensionKeyStore } from '../keystore';
import * as logger from '../logger';

let autoLockTimer: ReturnType<typeof setTimeout> | null = null;
let autoLockDisposable: vscode.Disposable | null = null;
const unlockedRoots = new Set<string>();

let unlockExpiresAt: number | null = null;

export function getUnlockExpiresAt(): number | null {
  return unlockExpiresAt;
}

function formatEnv(key: string, val: string): string {
  if (val.includes('"') || val.includes('\n') || val.includes(' ')) {
    return `${key}="${val.replace(/"/g, '\\"')}"`;
  }
  return `${key}=${val}`;
}

function parseDurationMinutes(s: string): number | null {
  const trimmed = s.trim().toLowerCase();
  if (/^(never|perm|permanent|forever|0)$/.test(trimmed)) return 0;
  const m = trimmed.match(/^(\d+)(m|h|s)?$/);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  const unit = (m[2] || 'm');
  if (unit === 's') return Math.max(0, Math.floor(n / 60));
  if (unit === 'm') return n;
  if (unit === 'h') return n * 60;
  return null;
}

export function getUnlockedRoots(): Set<string> {
  return unlockedRoots;
}

export async function run(keystore: ExtensionKeyStore, workspaceRoot?: string): Promise<void> {
  const root = workspaceRoot ?? (await import('../workspace').then((w) => w.getTargetWorkspaceRoot()));
  if (!root) {
    logger.error('DotEnvUp: No workspace folder with .env.up');
    return;
  }
  const envUpPath = path.join(root, '.env.up');
  const envPath = path.join(root, '.env');
  const envTmpPath = path.join(root, '.env.tmp');

  try {
    await fs.access(envUpPath);
  } catch {
    logger.error('.env.up not found. Run "DotEnvUp: Import" first.');
    return;
  }

  const stat = await fs.stat(envUpPath);
  if (!stat.isFile()) {
    logger.error('.env.up is not a file (directory or other).');
    return;
  }

  let privateKey = await keystore.getPrivateKey();
  if (!privateKey) {
    logger.error('DotEnvUp: No keypair. Run "DotEnvUp: Init" first.');
    return;
  }

  const { parse, decryptAny, parseEnvFile, entriesMatch } = await import('@dotenvup/format');
  const content = await fs.readFile(envUpPath, 'utf8');
  const file = parse(content);

  let entries: Record<string, string>;
  let rawContent: string | undefined;
  try {
    const result = await decryptAny(file, privateKey, '@local');
    entries = result.entries;
    rawContent = result.raw;
  } catch (err) {
    if (file.header.keyId) {
      const { keyFingerprint } = await import('@dotenvup/format');
      const publicKey = await keystore.getPublicKey();
      const ourKeyId = publicKey ? await keyFingerprint(publicKey) : null;
      const recovery = await import('./recoverKeyMismatch');
      const outcome = await recovery.run(keystore, {
        envUpPath,
        requiredKeyId: file.header.keyId,
        currentKeyId: ourKeyId,
        sourceAction: 'unlock',
      });
      if (outcome !== 'resolved') {
        logger.error('.env.up was encrypted with a different key. Cannot decrypt.');
        return;
      }
      privateKey = await keystore.getPrivateKey();
      if (!privateKey) {
        logger.error('DotEnvUp: Recovery completed but no private key is configured.');
        return;
      }
      const retry = await decryptAny(file, privateKey, '@local');
      entries = retry.entries;
      rawContent = retry.raw;
    } else {
      logger.error('DotEnvUp: Decryption failed', err);
      return;
    }
  }

  try {
    await fs.access(envPath);
    const existingContent = await fs.readFile(envPath, 'utf8');
    const existingEntries = parseEnvFile(existingContent);
    if (!entriesMatch(existingEntries, entries)) {
      const choice = await vscode.window.showWarningMessage(
        'Your .env has local changes. Unlock will overwrite. Proceed?',
        'Overwrite',
        'Cancel',
      );
      if (choice !== 'Overwrite') return;
    }
  } catch {
    // .env does not exist, no overwrite check
  }

  const config = vscode.workspace.getConfiguration('dotenvup');
  const defaultDurationStr = config.get<string>('defaultUnlockDuration', '5m');
  const defaultMinutes = parseDurationMinutes(defaultDurationStr) ?? 5;

  const items = [
    { label: `Default (${defaultDurationStr})`, value: defaultMinutes },
    { label: '5 minutes', value: 5 },
    { label: '15 minutes', value: 15 },
    { label: '1 hour', value: 60 },
    { label: 'Until close', value: 0 },
    { label: 'Forever (no auto-lock)', value: -1 },
  ];
  const chosen = await vscode.window.showQuickPick(items, {
    placeHolder: 'Auto-lock duration',
    title: 'DotEnvUp: Unlock',
  });
  if (!chosen) return;

  // Prefer raw content (preserves comments, blank lines, ordering) over reconstructed entries
  const out = rawContent ?? Object.entries(entries).map(([k, v]) => formatEnv(k, v)).join('\n') + '\n';
  await fs.writeFile(envTmpPath, out, 'utf8');
  await fs.rename(envTmpPath, envPath);

  unlockedRoots.add(root);
  logger.info(`DotEnvUp: Unlocked — ${Object.keys(entries).length} keys written`);

  if (autoLockTimer) clearTimeout(autoLockTimer);
  if (autoLockDisposable) autoLockDisposable.dispose();

  if (chosen.value > 0) {
    // Timed auto-lock
    const ms = chosen.value * 60 * 1000;
    unlockExpiresAt = Date.now() + ms;
    autoLockTimer = setTimeout(() => {
      unlockExpiresAt = null;
      void (async () => {
        // SAFETY: full decrypt verification before auto-lock deletion
        const privKey = await keystore.getPrivateKey();
        const { isSafeToDelete } = await import('@dotenvup/format');
        const safeCheck = await isSafeToDelete(envUpPath, privKey);
        if (!safeCheck.safe) {
          logger.error(`DotEnvUp: Auto-lock cancelled — ${safeCheck.reason}. Leaving .env intact.`);
          autoLockTimer = null;
          return;
        }
        try {
          await fs.unlink(envPath);
          logger.info('DotEnvUp: Auto-locked — .env removed');
        } catch {
          // ignore
        }
        autoLockTimer = null;
      })();
    }, ms);
  } else if (chosen.value === 0) {
    // Until close — locks when editor session ends (via disposeAutoLock)
    unlockExpiresAt = null;
  } else {
    // Forever (value === -1) — no auto-lock at all
    unlockExpiresAt = null;
  }

  autoLockDisposable = new vscode.Disposable(() => {
    if (autoLockTimer) {
      clearTimeout(autoLockTimer);
      autoLockTimer = null;
    }
  });
}

export function disposeAutoLock(): void {
  if (autoLockTimer) clearTimeout(autoLockTimer);
  if (autoLockDisposable) autoLockDisposable.dispose();
}
