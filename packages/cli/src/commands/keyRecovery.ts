/**
 * up key recovery status — whether a recovery bundle exists for the active Key-Id
 * up key migrate-envelope — migrate plaintext identity → file envelope
 */

import * as path from 'path';
import {
  keyFingerprint,
  detectKeyStorageMode,
  migratePlaintextToEnvelope,
  recoveryBundleExists,
  recoveryBundlePath,
} from '@dotenvup/format';
import * as keystore from '../keystore.js';
import * as logger from '../logger.js';

export async function runStatus(options?: { json?: boolean }): Promise<void> {
  const identityDir = keystore.getIdentityDir();
  const storage = await detectKeyStorageMode(identityDir);
  const pub = await keystore.getPublicKey();
  const keyId = pub ? await keyFingerprint(pub) : null;
  const hasRecovery = keyId ? await recoveryBundleExists(identityDir, keyId) : false;
  const bundlePath = keyId ? recoveryBundlePath(identityDir, keyId) : null;

  if (options?.json) {
    console.log(
      JSON.stringify({
        keyStorage: storage,
        keyId,
        hasRecoveryBundle: hasRecovery,
        recoveryBundlePath: hasRecovery ? bundlePath : null,
      }),
    );
    return;
  }

  logger.info(`Key storage: ${storage}`);
  logger.info(`Key-Id: ${keyId ?? '(none)'}`);
  if (!keyId) {
    logger.info('Recovery bundle: n/a (no keypair)');
    return;
  }
  logger.info(`Recovery bundle: ${hasRecovery ? `present (${bundlePath})` : 'missing'}`);
  if (!hasRecovery) {
    logger.info('Create one with: up key export (or re-run up init --force after archiving).');
  }
}

export async function runMigrateEnvelope(): Promise<void> {
  const identityDir = keystore.getIdentityDir();
  const storage = await detectKeyStorageMode(identityDir);
  if (storage === 'file-envelope') {
    logger.info('Already using file envelope storage.');
    return;
  }
  if (storage !== 'plaintext') {
    logger.error('No plaintext identity found to migrate.');
    process.exit(1);
  }

  const result = await migratePlaintextToEnvelope(identityDir);
  if (!result) {
    logger.error('Migration produced no result.');
    process.exit(1);
  }

  logger.info('Migrated plaintext identity to envelope.');
  logger.info(`Key-Id: ${result.keyId}`);
  logger.info(`Backup: ${result.bakPath}`);
  logger.info(`Envelope: ${path.join(identityDir, 'identity.enc')}`);
}
