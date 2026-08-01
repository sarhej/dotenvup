/**
 * up status — Lock state, key freshness, keypair status, drift indicator
 */

import * as path from 'path';
import * as fs from 'fs';
import {
  parse,
  parseHeader,
  decryptAny,
  detectKeyStorageMode,
  keyFingerprint,
  recoveryBundleExists,
  keychainHelperAvailable,
  sessionStatus,
  AuthCancelledError,
  NonInteractiveKeychainError,
} from '@dotenvup/format';
import * as keystore from '../keystore.js';
import { parseEnvFile, entriesMatch } from '../envParser.js';
import * as logger from '../logger.js';

const STALE_DAYS = 90;
export async function run(options?: { json?: boolean }): Promise<void> {
  const cwd = process.cwd();
  const envPath = path.join(cwd, '.env');
  const envUpPath = path.join(cwd, '.env.up');

  const hasEnv = fs.existsSync(envPath);
  const hasEnvUp = fs.existsSync(envUpPath);
  const identityDir = keystore.getIdentityDir();
  const keyStorage = await detectKeyStorageMode(identityDir);
  // Avoid Keychain prompt: status must not call getKeypair when wrap.source=keychain.
  let hasKeypair = keyStorage !== 'absent';
  let pub: Uint8Array | null = null;
  if (hasKeypair) {
    const pubPath = keystore.getPublicKeyPath();
    if (fs.existsSync(pubPath)) {
      try {
        pub = new Uint8Array(Buffer.from(fs.readFileSync(pubPath, 'utf8').trim(), 'base64'));
        if (pub.length !== 32) pub = null;
      } catch {
        pub = null;
      }
    }
  }
  if (!hasKeypair) {
    try {
      const kp = await keystore.getKeypair();
      hasKeypair = !!kp;
      pub = kp?.publicKey ?? pub;
    } catch (err) {
      if (!(err instanceof AuthCancelledError || err instanceof NonInteractiveKeychainError)) {
        // ignore
      }
    }
  }
  const keyId = pub ? await keyFingerprint(pub) : null;
  const hasRecoveryBundle = keyId ? await recoveryBundleExists(identityDir, keyId) : false;
  const upgradeRecommended = keyStorage === 'plaintext' || (hasKeypair && !hasRecoveryBundle);
  const keychainHelper = process.platform === 'darwin' ? await keychainHelperAvailable() : false;
  const keychainMigrateRecommended =
    keyStorage === 'file-envelope' && keychainHelper && hasRecoveryBundle;

  let keyCount = 0;
  let staleCount = 0;

  if (hasEnvUp) {
    if (!fs.statSync(envUpPath).isFile()) {
      logger.error('.env.up is not a file.');
      process.exit(1);
    }
    const content = fs.readFileSync(envUpPath, 'utf8');
    const header = parseHeader(content);
    const now = Date.now();
    keyCount = header.keys.length;
    for (const key of header.keys) {
      const updated = new Date(key.updatedAt).getTime();
      const daysAgo = (now - updated) / (24 * 60 * 60 * 1000);
      if (daysAgo > STALE_DAYS) staleCount++;
    }
  }

  const session = await sessionStatus();
  const sessionActive = session.active;

  // Drift indicator: when both .env and .env.up exist and we have keypair.
  // Skip when Keychain is cold (would prompt); warm session or non-keychain OK.
  let drift = false;
  const canDecryptForDrift =
    hasEnv &&
    hasEnvUp &&
    hasKeypair &&
    (keyStorage !== 'keychain' || sessionActive);
  if (canDecryptForDrift) {
    const stat = fs.statSync(envPath);
    if (stat.isFile()) {
      try {
        const privateKey = await keystore.getPrivateKey();
        if (privateKey) {
          const file = parse(fs.readFileSync(envUpPath, 'utf8'));
          const result = await decryptAny(file, privateKey, '@local');
          const envEntries = parseEnvFile(fs.readFileSync(envPath, 'utf8'));
          if (!entriesMatch(envEntries, result.entries)) {
            drift = true;
          }
        }
      } catch (err) {
        if (err instanceof AuthCancelledError || err instanceof NonInteractiveKeychainError) {
          // Skip drift; keychain cold / cancelled
        }
        // Skip drift check on error (e.g. decrypt fails)
      }
    }
  }

  if (options?.json) {
    const formatRemaining = (ms: number | null): string | null => {
      if (ms == null || ms < 0) return null;
      const mins = Math.round(ms / 60_000);
      if (mins < 60) return `${mins}m`;
      return `${Math.round(mins / 60)}h`;
    };
    const result: Record<string, unknown> = {
      locked: !hasEnv,
      hasEnvUp,
      hasKeypair,
      keyStorage,
      keyId,
      hasRecoveryBundle,
      upgradeRecommended,
      keychainHelper,
      keychainMigrateRecommended,
      sessionActive,
      sessionIdleExpiresIn: sessionActive ? formatRemaining(session.idleMsLeft) : null,
      sessionAbsoluteExpiresIn: sessionActive ? formatRemaining(session.absoluteMsLeft) : null,
      keyCount,
      staleCount,
      drift,
    };
    console.log(JSON.stringify(result));
    return;
  }

  logger.info(`Lock status: ${hasEnv ? 'UNLOCKED (.env exists)' : 'LOCKED (.env absent)'}`);
  logger.info(`.env.up: ${hasEnvUp ? 'present' : 'not found'}`);
  logger.info(`Keypair: ${hasKeypair ? 'configured' : 'not configured'}`);
  logger.info(`Key storage: ${keyStorage}`);
  if (keyStorage === 'keychain') {
    logger.info(`Session: ${sessionActive ? 'active (warm)' : 'inactive (cold — next decrypt may prompt)'}`);
  }
  if (upgradeRecommended) {
    logger.info(
      'Tip: run `up key upgrade` to add a recovery code and encrypt ~/.dotenvup/identity (Key-Id unchanged; opt-in).',
    );
  }
  if (keychainMigrateRecommended) {
    logger.info(
      'Tip (experimental): run `up key migrate-to-keychain` to store the wrapping key in macOS Keychain (Touch ID / password).',
    );
  }

  if (hasEnvUp) {
    if (staleCount > 0) {
      logger.info(`Keys older than ${STALE_DAYS} days: ${staleCount}`);
    }
    logger.info(`Total keys: ${keyCount}`);
  }

  if (drift) {
    logger.info("Drift: .env differs from .env.up — run 'up import' to save changes, or 'up lock --force' to discard");
  }
}
