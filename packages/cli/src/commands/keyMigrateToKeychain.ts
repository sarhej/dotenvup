/**
 * up key migrate-to-keychain — opt-in: move file wrapping key into macOS Keychain.
 */

import {
  detectKeyStorageMode,
  migrateFileEnvelopeToKeychain,
  keychainHelperAvailable,
  AuthCancelledError,
  NonInteractiveKeychainError,
  keyFingerprint,
  recoveryBundleExists,
} from '@dotenvup/format';
import * as keystore from '../keystore.js';
import * as logger from '../logger.js';

export async function run(_options?: { yes?: boolean }): Promise<void> {
  if (process.platform !== 'darwin') {
    logger.error('Keychain migration is only available on macOS.');
    process.exit(1);
  }

  if (!(await keychainHelperAvailable())) {
    logger.error(
      'macOS Keychain helper not found. Build or install @dotenvup/keychain-darwin (bin/dotenvup-keychain).',
    );
    process.exit(1);
  }

  const identityDir = keystore.getIdentityDir();
  const storage = await detectKeyStorageMode(identityDir);

  if (storage === 'keychain') {
    logger.info('Already using Keychain for the identity wrapping key.');
    return;
  }

  if (storage === 'plaintext') {
    logger.error('Encrypt identity first: up key upgrade');
    process.exit(1);
  }

  if (storage !== 'file-envelope') {
    logger.error('No file-wrapped identity.enc found. Run: up key upgrade');
    process.exit(1);
  }

  const kp = await keystore.getKeypair();
  if (!kp) {
    logger.error('No keypair found. Run: up init');
    process.exit(1);
  }

  const keyId = await keyFingerprint(kp.publicKey);
  if (!(await recoveryBundleExists(identityDir, keyId))) {
    logger.error('Recovery bundle required before Keychain migration. Run: up key upgrade');
    process.exit(1);
  }

  logger.info('Moving wrapping key into macOS Keychain (Touch ID / password may prompt)...');

  try {
    const result = await migrateFileEnvelopeToKeychain(identityDir);
    logger.info(`Keychain migration complete. Key-Id: ${result.keyId}`);
    logger.info(`Service: ${result.service}  account: ${result.account}`);
    logger.info('Tip: after the first decrypt, the session agent stays warm (~30m idle). Check: up session status');
  } catch (err) {
    if (err instanceof AuthCancelledError) {
      logger.error('Authentication cancelled. File envelope left unchanged.');
      process.exit(1);
    }
    if (err instanceof NonInteractiveKeychainError) {
      logger.error(err.message);
      process.exit(1);
    }
    logger.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}
