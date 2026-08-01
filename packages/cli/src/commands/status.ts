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
  const hasKeypair = await keystore.hasKeypair();
  const identityDir = keystore.getIdentityDir();
  const keyStorage = await detectKeyStorageMode(identityDir);
  const pub = hasKeypair ? await keystore.getPublicKey() : null;
  const keyId = pub ? await keyFingerprint(pub) : null;
  const hasRecoveryBundle = keyId ? await recoveryBundleExists(identityDir, keyId) : false;
  const upgradeRecommended = keyStorage === 'plaintext' || (hasKeypair && !hasRecoveryBundle);

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

  // Drift indicator: when both .env and .env.up exist and we have keypair
  let drift = false;
  if (hasEnv && hasEnvUp && hasKeypair) {
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
      } catch {
        // Skip drift check on error (e.g. decrypt fails)
      }
    }
  }

  if (options?.json) {
    const result: Record<string, unknown> = {
      locked: !hasEnv,
      hasEnvUp,
      hasKeypair,
      keyStorage,
      keyId,
      hasRecoveryBundle,
      upgradeRecommended,
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
  if (upgradeRecommended) {
    logger.info(
      'Tip: run `up key upgrade` to add a recovery code and encrypt ~/.dotenvup/identity (Key-Id unchanged; opt-in).',
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
