/**
 * up show [key] — Decrypt and print values
 */

import * as path from 'path';
import * as fs from 'fs';
import { parse, decryptAny } from '@dotenvup/format';
import * as keystore from '../keystore.js';
import * as logger from '../logger.js';

export async function run(keyName?: string): Promise<void> {
  const cwd = process.cwd();
  const envUpPath = path.join(cwd, '.env.up');

  if (!fs.existsSync(envUpPath)) {
    logger.error('.env.up not found. Run: up import .env');
    process.exit(1);
  }
  if (!fs.statSync(envUpPath).isFile()) {
    logger.error('.env.up is not a file.');
    process.exit(1);
  }

  const privateKey = await keystore.getPrivateKey();
  if (!privateKey) {
    logger.error('No keypair found. Run: up init');
    process.exit(1);
  }

  const content = fs.readFileSync(envUpPath, 'utf8');
  const file = parse(content);
  const { entries } = await decryptAny(file, privateKey, '@local');

  if (keyName) {
    if (!(keyName in entries)) {
      logger.error(`Key not found: ${keyName}`);
      process.exit(1);
    }
    logger.info(entries[keyName]);
  } else {
    for (const [k, v] of Object.entries(entries)) {
      logger.info(`${k}=${v}`);
    }
  }
}
