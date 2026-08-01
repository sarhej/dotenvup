/**
 * up key upgrade — safe opt-in path for existing plaintext identities:
 * recovery bundle first (verified), then file envelope (verified), then remove plaintext.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';
import {
  keyFingerprint,
  detectKeyStorageMode,
  migratePlaintextToEnvelope,
  recoveryBundleExists,
  recoveryBundlePath,
  exportKeyBundle,
  importKeyBundle,
  parseKeyBundle,
} from '@dotenvup/format';
import { generatePassphrase } from '@dotenvup/secret-generator';
import * as keystore from '../keystore.js';
import * as logger from '../logger.js';

const RECOVERY_WORD_COUNT = 8;

function promptSavedRecovery(): Promise<boolean> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question('Type "saved" after you have stored this recovery code: ', (answer) => {
      rl.close();
      resolve((answer ?? '').trim().toLowerCase() === 'saved');
    });
  });
}

async function ensureRecoveryBundle(
  identityDir: string,
  publicKey: Uint8Array,
  privateKey: Uint8Array,
): Promise<{ code: string | null; bundlePath: string; created: boolean }> {
  const keyId = await keyFingerprint(publicKey);
  const bundlePath = recoveryBundlePath(identityDir, keyId);
  if (await recoveryBundleExists(identityDir, keyId)) {
    return { code: null, bundlePath, created: false };
  }

  const code = generatePassphrase({ wordCount: RECOVERY_WORD_COUNT, separator: '-' });
  const bundle = await exportKeyBundle({ publicKey, privateKey }, code);

  // Verify bundle before any identity migration.
  const roundtrip = await importKeyBundle(bundle, code);
  if (
    Buffer.from(roundtrip.privateKey).toString('base64') !== Buffer.from(privateKey).toString('base64') ||
    Buffer.from(roundtrip.publicKey).toString('base64') !== Buffer.from(publicKey).toString('base64')
  ) {
    throw new Error('Recovery bundle verification failed. Aborting without changing identity files.');
  }

  fs.mkdirSync(path.dirname(bundlePath), { recursive: true, mode: 0o700 });
  const tmp = `${bundlePath}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, JSON.stringify(bundle, null, 2) + '\n', { mode: 0o600 });
  fs.renameSync(tmp, bundlePath);

  // Re-read from disk and verify again (guards against partial writes).
  const onDisk = parseKeyBundle(fs.readFileSync(bundlePath, 'utf8'));
  const fromDisk = await importKeyBundle(onDisk, code);
  if (Buffer.from(fromDisk.privateKey).toString('base64') !== Buffer.from(privateKey).toString('base64')) {
    try {
      fs.unlinkSync(bundlePath);
    } catch {
      // ignore
    }
    throw new Error('Recovery bundle on-disk verification failed. Aborting without changing identity files.');
  }

  return { code, bundlePath, created: true };
}

export async function run(options?: { yes?: boolean }): Promise<void> {
  const identityDir = keystore.getIdentityDir();
  const storage = await detectKeyStorageMode(identityDir);
  const kp = await keystore.getKeypair();
  if (!kp) {
    logger.error('No keypair found. Run: up init');
    process.exit(1);
  }

  const keyId = await keyFingerprint(kp.publicKey);

  if (storage === 'absent') {
    logger.error('No usable identity found.');
    process.exit(1);
  }

  // Always ensure recovery exists (envelope-only installs may lack it).
  let recoveryCode: string | null = null;
  let recoveryPath: string;
  try {
    const recovery = await ensureRecoveryBundle(identityDir, kp.publicKey, kp.privateKey);
    recoveryCode = recovery.code;
    recoveryPath = recovery.bundlePath;
    if (recovery.created) {
      logger.info(`Recovery bundle created: ${recoveryPath}`);
    } else {
      logger.info(`Recovery bundle already present: ${recoveryPath}`);
    }
  } catch (err) {
    logger.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }

  if (storage === 'plaintext') {
    logger.info('Migrating plaintext identity → encrypted envelope (Key-Id unchanged)…');
    try {
      const result = await migratePlaintextToEnvelope(identityDir);
      if (!result) {
        logger.error('Migration produced no result; plaintext left unchanged.');
        process.exit(1);
      }
      // Post-check: key still loads and matches.
      const after = await keystore.getKeypair();
      if (
        !after ||
        Buffer.from(after.privateKey).toString('base64') !== Buffer.from(kp.privateKey).toString('base64')
      ) {
        logger.error(
          'Post-migration key mismatch. Plaintext bak was kept at identity.bak-* — do not delete it. File a bug.',
        );
        process.exit(2);
      }
      logger.info(`Envelope ready: ${path.join(identityDir, 'identity.enc')}`);
      logger.info(`Plaintext backup: ${result.bakPath}`);
      logger.info('(You may delete the .bak after you confirm unlock/import still works.)');
    } catch (err) {
      logger.error(err instanceof Error ? err.message : String(err));
      logger.error('Plaintext identity was left unchanged.');
      process.exit(1);
    }
  } else if (storage === 'file-envelope') {
    logger.info('Already using file envelope storage.');
  }

  const finalStorage = await detectKeyStorageMode(identityDir);
  logger.info(`Key-Id: ${keyId}`);
  logger.info(`Key storage: ${finalStorage}`);

  if (recoveryCode) {
    logger.info('');
    logger.info('Recovery code (shown once — store it somewhere durable):');
    logger.info(`  ${recoveryCode}`);
    logger.info('');
    if (process.stdin.isTTY && !options?.yes) {
      const ok = await promptSavedRecovery();
      if (!ok) {
        logger.info('Re-export later with: up key export (while this identity is still accessible).');
      }
    }
  } else {
    logger.info('No new recovery code to show (bundle already existed).');
  }
}
