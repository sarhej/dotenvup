/**
 * up lock — Delete plaintext .env
 * Prompts for confirmation unless --yes.
 * Detects drift ( .env differs from .env.up ); requires --force to proceed when drift.
 * If .env.up cannot be decrypted, refuses by default; use --force-delete to delete plaintext anyway.
 */

import * as path from 'path';
import * as fs from 'fs';
import * as readline from 'readline';
import { parse, decryptAny } from '@dotenvup/format';
import * as keystore from '../keystore.js';
import { parseEnvFile, entriesMatch, entriesDiff } from '../envParser.js';
import * as logger from '../logger.js';

function formatDiffSummary(diff: { added: string[]; removed: string[]; changed: string[] }): string {
  const parts: string[] = [];
  if (diff.added.length) parts.push(`+${diff.added.length} new`);
  if (diff.removed.length) parts.push(`-${diff.removed.length} removed`);
  if (diff.changed.length) parts.push(`${diff.changed.length} changed`);
  return parts.join(', ') || 'diff';
}

async function promptConfirm(keyCount: number, displayPath: string): Promise<boolean> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(
      `.env.up has your ${keyCount} keys encrypted (shareable). Lock removes plaintext ${displayPath}. Proceed? [y/N]: `,
      (answer) => {
        rl.close();
        resolve(/^y(es)?$/i.test(answer.trim()));
      }
    );
  });
}

async function promptForceDelete(displayPath: string): Promise<boolean> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(
      `WARNING: Cannot decrypt .env.up to verify safety. Delete plaintext ${displayPath} anyway? [y/N]: `,
      (answer) => {
        rl.close();
        resolve(/^y(es)?$/i.test(answer.trim()));
      }
    );
  });
}

function refuseWithoutForceDelete(reason: string): never {
  logger.error(`Refusing to delete .env because .env.up could not be decrypted (${reason}).`);
  logger.error(`This prevents losing changes that may exist only in .env.`);
  logger.error(`To delete plaintext anyway (destructive): up lock --force-delete`);
  logger.error(`For scripts/CI: up lock --force-delete --yes`);
  process.exit(1);
}

export async function run(options?: { yes?: boolean; force?: boolean; forceDelete?: boolean }): Promise<void> {
  const cwd = process.cwd();
  const envPath = path.join(cwd, '.env');
  const envUpPath = path.join(cwd, '.env.up');

  if (!fs.existsSync(envUpPath)) {
    logger.error('.env.up not found. Nothing to lock.');
    process.exit(1);
  }

  if (!fs.existsSync(envPath)) {
    logger.info('.env is already locked (or does not exist).');
    return;
  }

  const stat = fs.statSync(envPath);
  if (!stat.isFile()) {
    logger.error('.env is not a file (got directory or other). Cannot lock.');
    process.exit(1);
  }

  const envContent = fs.readFileSync(envPath, 'utf8');
  const envEntries = parseEnvFile(envContent);
  if (Object.keys(envEntries).length === 0) {
    logger.error('.env has no KEY=VALUE entries to lock.');
    process.exit(1);
  }

  const displayPath = path.relative(cwd, envPath) || '.env';
  const confirmed = options?.yes ?? false;
  const forceDelete = options?.forceDelete ?? false;

  // Drift detection requires decrypting .env.up; if decrypt is impossible, refuse by default.
  let decrypted: Record<string, string> | null = null;
  try {
    const privateKey = await keystore.getPrivateKey();
    if (!privateKey) throw new Error('no keypair');

    const envUpContent = fs.readFileSync(envUpPath, 'utf8');
    const file = parse(envUpContent);
    const result = await decryptAny(file, privateKey, '@local');
    decrypted = result.entries;
  } catch (err) {
    if (!forceDelete) {
      const msg = err instanceof Error ? err.message : String(err);
      refuseWithoutForceDelete(msg);
    }

    // force-delete path: still require confirmation (TTY) or --yes (non-TTY)
    if (!confirmed) {
      if (!process.stdin.isTTY) {
        logger.error('Not a TTY. Use --yes to lock without confirmation.');
        process.exit(1);
      }
      const ok = await promptForceDelete(displayPath);
      if (!ok) {
        logger.info('Cancelled.');
        return;
      }
    }

    // TOCTOU: ensure no concurrent edit since initial read
    const recheckContent = fs.readFileSync(envPath, 'utf8');
    const recheckEntries = parseEnvFile(recheckContent);
    if (!entriesMatch(recheckEntries, envEntries)) {
      logger.error('File changed during lock. Run lock again.');
      process.exit(1);
    }

    try {
      fs.unlinkSync(envPath);
    } catch (e) {
      const m = e instanceof Error ? e.message : String(e);
      logger.error(`Failed to remove .env: ${m}`);
      process.exit(2);
    }
    logger.info(`Locked — .env removed (${Object.keys(envEntries).length} keys).`);
    return;
  }

  const hasDrift = decrypted ? !entriesMatch(envEntries, decrypted) : false;

  if (hasDrift) {
    const diff = entriesDiff(decrypted!, envEntries);
    logger.warn(`.env has changes not in .env.up (${formatDiffSummary(diff)}).`);
    logger.info(`Import first to save them, or lock anyway with --force (changes will be lost).`);
    const force = options?.force ?? false;
    if (!force) {
      if (options?.yes) {
        logger.error('Use --force to lock with unsaved changes.');
        process.exit(1);
      }
      if (!process.stdin.isTTY) {
        logger.error('Not a TTY. Use --force to lock with unsaved changes.');
        process.exit(1);
      }
      // TTY: could add second prompt "Lock anyway? [y/N]" — plan says require --force
      logger.error('Use --force to proceed.');
      process.exit(1);
    }
  }

  if (!confirmed) {
    if (!process.stdin.isTTY) {
      logger.error('Not a TTY. Use --yes to lock without confirmation.');
      process.exit(1);
    }
    const ok = await promptConfirm(Object.keys(envEntries).length, displayPath);
    if (!ok) {
      logger.info('Cancelled.');
      return;
    }
  }

  // TOCTOU: re-read .env and ensure it matches what we read at start (no concurrent edit)
  const recheckContent = fs.readFileSync(envPath, 'utf8');
  const recheckEntries = parseEnvFile(recheckContent);
  if (!entriesMatch(recheckEntries, envEntries)) {
    logger.error('File changed during lock. Run lock again.');
    process.exit(1);
  }

  try {
    fs.unlinkSync(envPath);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error(`Failed to remove .env: ${msg}`);
    process.exit(2);
  }

  logger.info(`Locked — .env removed (${Object.keys(envEntries).length} keys).`);
}
