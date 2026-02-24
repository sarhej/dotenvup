import * as fs from 'fs/promises';
import * as readline from 'readline/promises';
import { importKeyBundle, parseKeyBundle, keyFingerprint } from '@dotenvup/format';
import * as keystore from '../keystore.js';
import * as logger from '../logger.js';

export interface KeyImportOptions {
  passphrase?: string;
  force?: boolean;
  dryRun?: boolean;
}

async function promptPassphrase(): Promise<string | null> {
  if (!process.stdin.isTTY) return null;
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  try {
    return (await rl.question('Passphrase for key import bundle: ')).trim();
  } finally {
    rl.close();
  }
}

async function confirmOverwrite(currentKeyId: string, incomingKeyId: string): Promise<boolean> {
  if (!process.stdin.isTTY) return false;
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  try {
    const ans = (await rl.question(
      `Existing key (${currentKeyId}) differs from imported (${incomingKeyId}). Overwrite? [y/N]: `,
    )).trim().toLowerCase();
    return ans === 'y' || ans === 'yes';
  } finally {
    rl.close();
  }
}

export async function run(inputFile: string | undefined, options?: KeyImportOptions): Promise<void> {
  if (!inputFile) {
    logger.error('Input key bundle file is required. Usage: up key import <file>');
    process.exitCode = 1;
    return;
  }

  const raw = await fs.readFile(inputFile, 'utf8');
  const bundle = parseKeyBundle(raw);
  const passphrase = options?.passphrase ?? (await promptPassphrase());
  if (!passphrase) {
    logger.error('Passphrase is required. Use --passphrase in non-interactive mode.');
    process.exitCode = 1;
    return;
  }

  const imported = await importKeyBundle(bundle, passphrase);
  const incomingKeyId = await keyFingerprint(imported.publicKey);

  const existing = await keystore.getKeypair();
  if (existing) {
    const currentKeyId = await keyFingerprint(existing.publicKey);
    if (currentKeyId !== incomingKeyId && !options?.force) {
      const confirmed = await confirmOverwrite(currentKeyId, incomingKeyId);
      if (!confirmed) {
        logger.warn('Key import cancelled. Existing keypair preserved.');
        process.exitCode = 1;
        return;
      }
    }
  }

  if (options?.dryRun) {
    logger.info(`DotEnvUp: Key bundle is valid. Incoming key id: ${incomingKeyId}`);
    return;
  }

  await keystore.storeKeypair(imported.publicKey, imported.privateKey);
  logger.info(`DotEnvUp: Key imported. Active key id: ${incomingKeyId}`);
}

