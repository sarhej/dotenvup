/**
 * up init — Generate keypair and store in ~/.dotenvup
 */

import * as readline from 'readline';
import { generateKeypair } from '@dotenvup/format';
import * as keystore from '../keystore.js';
import * as author from '../author.js';
import * as logger from '../logger.js';

const DEFAULT_RECIPIENT = '@local';

function promptNickname(): Promise<string> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question('Optional nickname for Encrypted-By (e.g. your name; Enter for @local): ', (answer) => {
      rl.close();
      resolve((answer ?? '').trim());
    });
  });
}

export async function run(options?: { force?: boolean }): Promise<void> {
  const hasKeys = await keystore.hasKeypair();
  if (hasKeys && !options?.force) {
    logger.error('Keypair already exists. Use --force to overwrite.');
    process.exit(1);
  }

  const { publicKey, privateKey } = await generateKeypair();
  await keystore.storeKeypair(publicKey, privateKey);

  if (process.stdin.isTTY) {
    try {
      const nick = await promptNickname();
      if (nick) author.setNickname(nick);
    } catch {
      // non-interactive or error
    }
  }

  const pubB64 = Buffer.from(publicKey).toString('base64');
  const fingerprint = pubB64.slice(0, 16) + '...';

  logger.info('DotEnvUp keypair created.');
  logger.info(`Public key saved to: ${keystore.getPublicKeyPath()}`);
  logger.info(`Fingerprint: ${fingerprint}`);
  logger.info('');
  logger.info(`Recipient ID: ${DEFAULT_RECIPIENT}`);
  logger.info('You can now run: up import .env');
}
