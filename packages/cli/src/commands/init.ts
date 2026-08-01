/**
 * up init — Generate keypair and store in ~/.dotenvup (envelope + recovery)
 */

import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';
import {
  generateKeypair,
  keyFingerprint,
  exportKeyBundle,
  archiveIdentity,
  recoveryBundlePath,
  detectKeyStorageMode,
} from '@dotenvup/format';
import { generatePassphrase } from '@dotenvup/secret-generator';
import * as keystore from '../keystore.js';
import * as author from '../author.js';
import * as logger from '../logger.js';

const DEFAULT_RECIPIENT = '@local';
const RECOVERY_WORD_COUNT = 8;

function promptNickname(): Promise<string> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question('Optional nickname for Encrypted-By (e.g. your name; Enter for @local): ', (answer) => {
      rl.close();
      resolve((answer ?? '').trim());
    });
  });
}

function promptSavedRecovery(): Promise<boolean> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question('Type "saved" after you have stored this recovery code: ', (answer) => {
      rl.close();
      resolve((answer ?? '').trim().toLowerCase() === 'saved');
    });
  });
}

async function writeRecoveryBundle(
  identityDir: string,
  publicKey: Uint8Array,
  privateKey: Uint8Array,
): Promise<{ code: string; bundlePath: string; keyId: string }> {
  const keyId = await keyFingerprint(publicKey);
  const code = generatePassphrase({ wordCount: RECOVERY_WORD_COUNT, separator: '-' });
  const bundle = await exportKeyBundle({ publicKey, privateKey }, code);
  const bundlePath = recoveryBundlePath(identityDir, keyId);
  fs.mkdirSync(path.dirname(bundlePath), { recursive: true, mode: 0o700 });
  fs.writeFileSync(bundlePath, JSON.stringify(bundle, null, 2) + '\n', { mode: 0o600 });
  return { code, bundlePath, keyId };
}

export async function run(options?: { force?: boolean; yes?: boolean }): Promise<void> {
  const hasKeys = await keystore.hasKeypair();
  if (hasKeys && !options?.force) {
    logger.error('Keypair already exists. Use --force to overwrite.');
    process.exit(1);
  }

  const identityDir = keystore.getIdentityDir();

  if (hasKeys && options?.force) {
    const pub = await keystore.getPublicKey();
    if (pub) {
      const oldKeyId = await keyFingerprint(pub);
      const dest = await archiveIdentity(identityDir, oldKeyId);
      logger.info(`Previous identity archived to: ${dest}`);
    }
  }

  const { publicKey, privateKey } = await generateKeypair();
  await keystore.storeKeypair(publicKey, privateKey);

  const { code, bundlePath, keyId } = await writeRecoveryBundle(identityDir, publicKey, privateKey);

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
  const storage = await detectKeyStorageMode(identityDir);

  logger.info('DotEnvUp keypair created.');
  logger.info(`Key-Id: ${keyId}`);
  logger.info(`Storage: ${storage} (${path.join(identityDir, 'identity.enc')})`);
  logger.info(`Public key saved to: ${keystore.getPublicKeyPath()}`);
  logger.info(`Fingerprint: ${fingerprint}`);
  logger.info(`Recovery bundle: ${bundlePath}`);
  logger.info('');
  logger.info('Recovery code (shown once — store it somewhere durable):');
  logger.info(`  ${code}`);
  logger.info('');

  if (process.stdin.isTTY && !options?.yes) {
    const ok = await promptSavedRecovery();
    if (!ok) {
      logger.info('You can re-export later with: up key export (while this identity is still accessible).');
    }
  }

  logger.info(`Recipient ID: ${DEFAULT_RECIPIENT}`);
  logger.info('You can now run: up import .env');
}
