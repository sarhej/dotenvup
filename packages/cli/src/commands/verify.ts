/**
 * up verify — Validate [policy] consistency (no secret values printed)
 */

import * as path from 'path';
import * as fs from 'fs';
import { parse, verifyEnvUp } from '@dotenvup/format';
import * as keystore from '../keystore.js';
import * as logger from '../logger.js';

export async function run(options?: { json?: boolean }): Promise<void> {
  const cwd = process.cwd();
  const envUpPath = path.join(cwd, '.env.up');

  if (!fs.existsSync(envUpPath)) {
    logger.error('.env.up not found.');
    process.exit(1);
  }

  const content = fs.readFileSync(envUpPath, 'utf8');
  const file = parse(content);
  const privateKey = await keystore.getPrivateKey();
  const result = await verifyEnvUp(file, privateKey ?? undefined);

  if (options?.json) {
    console.log(JSON.stringify({ ok: result.ok, errors: result.errors }));
  } else if (result.ok) {
    logger.info(file.policy ? 'Policy verification passed.' : 'No [policy] section; structural checks passed.');
  } else {
    for (const err of result.errors) {
      logger.error(`${err.code}: ${err.message}`);
    }
  }

  process.exit(result.ok ? 0 : 1);
}
