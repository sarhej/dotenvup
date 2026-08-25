/**
 * up reencrypt — Re-encrypt .env.up for all configured recipients (policy-aware).
 * Policy mode requires a full-catalog holder (same gate as owner sync on import).
 */

import * as path from 'path';
import * as fs from 'fs';
import {
  parse,
  serialize,
  decryptAny,
  reencryptAll,
  create,
  resolveRecipientPublicKeys,
  assertCanReencryptAll,
  writeEnvUpAtomic,
} from '@dotenvup/format';
import * as keystore from '../keystore.js';
import * as author from '../author.js';
import * as logger from '../logger.js';

export async function run(): Promise<void> {
  const cwd = process.cwd();
  const envUpPath = path.join(cwd, '.env.up');

  if (!fs.existsSync(envUpPath)) {
    logger.error('.env.up not found.');
    process.exit(1);
  }

  const privateKey = await keystore.getPrivateKey();
  const publicKey = await keystore.getPublicKey();
  if (!privateKey || !publicKey) {
    logger.error('No keypair found. Run: up init');
    process.exit(1);
  }

  const content = fs.readFileSync(envUpPath, 'utf8');
  const file = parse(content);
  const { entries, raw, recipient } = await decryptAny(file, privateKey, '@local');

  if (Object.keys(entries).length === 0) {
    logger.error('Decrypted .env.up has no entries — aborting.');
    process.exit(1);
  }

  const authorId = author.getAuthor();
  const recipientPublicKeys = await resolveRecipientPublicKeys(cwd, publicKey);

  try {
    if (file.policy) {
      assertCanReencryptAll(file, recipient, entries, recipientPublicKeys);
    }
  } catch (err) {
    logger.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }

  const updated = file.policy
    ? await reencryptAll(file, entries, authorId, recipientPublicKeys, raw)
    : await create(entries, authorId, recipientPublicKeys, raw);

  await writeEnvUpAtomic(envUpPath, serialize(updated), privateKey);
  logger.info(
    file.policy
      ? `Re-encrypted .env.up for ${file.policy.rows.length} policy recipient(s).`
      : `Re-encrypted .env.up for ${recipientPublicKeys.size} recipient(s).`,
  );
}
