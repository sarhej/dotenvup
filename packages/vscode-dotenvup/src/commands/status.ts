/**
 * DotEnvUp: Status — Lock state, key freshness, keypair status
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs/promises';
import type { ExtensionKeyStore } from '../keystore';
import * as logger from '../logger';

const STALE_DAYS = 90;

export async function run(keystore: ExtensionKeyStore, workspaceRoot?: string): Promise<void> {
  const root = workspaceRoot ?? (await import('../workspace').then((w) => w.getTargetWorkspaceRoot()));
  if (!root) {
    logger.error('DotEnvUp: No workspace folder with .env.up');
    return;
  }
  const envPath = path.join(root, '.env');
  const envUpPath = path.join(root, '.env.up');

  let hasEnv = false;
  let hasEnvUp = false;
  try {
    await fs.access(envPath);
    hasEnv = true;
  } catch {
    // ignore
  }
  try {
    await fs.access(envUpPath);
    hasEnvUp = true;
  } catch {
    // ignore
  }

  const hasKeypair = await keystore.hasKeypair();

  let msg = `Lock: ${hasEnv ? 'UNLOCKED' : 'LOCKED'}\n.env.up: ${hasEnvUp ? 'present' : 'not found'}\nKeypair: ${hasKeypair ? 'configured' : 'not configured'}`;

  if (hasEnvUp) {
    const { parseHeader } = await import('@dotenvup/format');
    const content = await fs.readFile(envUpPath, 'utf8');
    const header = parseHeader(content);
    const now = Date.now();
    let stale = 0;
    for (const key of header.keys) {
      const t = new Date(key.updatedAt).getTime();
      if ((now - t) / (24 * 60 * 60 * 1000) > STALE_DAYS) stale++;
    }
    msg += `\nKeys: ${header.keys.length}`;
    if (stale > 0) msg += ` (${stale} older than ${STALE_DAYS} days)`;
  }

  logger.info(msg);
}
