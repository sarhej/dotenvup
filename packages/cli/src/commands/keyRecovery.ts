/**
 * up key recovery status — whether a recovery bundle exists for the active Key-Id
 * up key migrate-envelope — alias → up key upgrade (recovery-first safe path)
 */

import {
  keyFingerprint,
  detectKeyStorageMode,
  recoveryBundleExists,
  recoveryBundlePath,
} from '@dotenvup/format';
import * as keystore from '../keystore.js';
import * as logger from '../logger.js';
import { run as runUpgrade } from './keyUpgrade.js';

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
        upgradeRecommended: storage === 'plaintext' || (Boolean(keyId) && !hasRecovery),
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
  if (storage === 'plaintext' || !hasRecovery) {
    logger.info('Recommended: up key upgrade  (recovery code + encrypted identity; Key-Id unchanged)');
  }
}

/** @deprecated Prefer `up key upgrade` — kept as an alias so docs/scripts keep working. */
export async function runMigrateEnvelope(options?: { yes?: boolean }): Promise<void> {
  logger.info('Note: "migrate-envelope" now runs the full safe upgrade (recovery first).');
  await runUpgrade(options);
}
