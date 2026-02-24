import * as fs from 'fs/promises';
import * as path from 'path';
import * as readline from 'readline/promises';
import { exportKeyBundle } from '@dotenvup/format';
import * as keystore from '../keystore.js';
import * as logger from '../logger.js';

export interface KeyExportOptions {
  passphrase?: string;
}

async function promptPassphrase(): Promise<string | null> {
  if (!process.stdin.isTTY) return null;
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  try {
    const passphrase = (await rl.question('Passphrase for key export bundle (min 8 chars): ')).trim();
    const confirm = (await rl.question('Confirm passphrase: ')).trim();
    if (passphrase !== confirm) {
      logger.error('Passphrases do not match.');
      return null;
    }
    return passphrase;
  } finally {
    rl.close();
  }
}

export async function run(outputFile?: string, options?: KeyExportOptions): Promise<void> {
  const kp = await keystore.getKeypair();
  if (!kp) {
    logger.error('No keypair found. Run "up init" first.');
    process.exitCode = 1;
    return;
  }

  const passphrase = options?.passphrase ?? (await promptPassphrase());
  if (!passphrase) {
    logger.error('Passphrase is required. Use --passphrase in non-interactive mode.');
    process.exitCode = 1;
    return;
  }

  const bundle = await exportKeyBundle(kp, passphrase);
  const filename = outputFile && outputFile.trim().length > 0
    ? outputFile
    : path.join(process.cwd(), `dotenvup-key-${bundle.keyId}.dotenvup-key`);
  await fs.writeFile(filename, JSON.stringify(bundle, null, 2) + '\n', { mode: 0o600 });
  logger.info(`DotEnvUp: Key exported to ${filename}`);
}

