/**
 * Re-encrypt .env.up with current recipients (e.g. after adding a new recipient).
 * Decrypts with local key, then creates a new file with all recipients from config.
 * Policy mode requires a full-catalog holder (same gate as merge owner sync).
 */

import * as fs from 'fs/promises';
import type { ExtensionKeyStore } from '../keystore';

export async function reencryptLocked(
  envUpPath: string,
  root: string,
  keystore: ExtensionKeyStore,
): Promise<void> {
  const {
    parse,
    decryptAny,
    reencryptAll,
    create,
    serialize,
    resolveRecipientPublicKeys,
    assertCanReencryptAll,
    writeEnvUpAtomic,
  } = await import('@dotenvup/format');
  const { getAuthor } = await import('../author');

  const publicKey = await keystore.getPublicKey();
  const privateKey = await keystore.requirePrivateKey();
  if (!publicKey) throw new Error('No public key');

  const content = await fs.readFile(envUpPath, 'utf8');
  const file = parse(content);
  const { entries, raw, recipient } = await decryptAny(file, privateKey, '@local');

  if (Object.keys(entries).length === 0) {
    throw new Error('Decrypted .env.up has zero entries — aborting to avoid data loss');
  }

  const author = await getAuthor(keystore.getIdentityDir());
  const recipients = await resolveRecipientPublicKeys(root, publicKey);

  if (file.policy) {
    assertCanReencryptAll(file, recipient, entries, recipients);
  }

  const newFile = file.policy
    ? await reencryptAll(file, entries, author, recipients, raw)
    : await create(entries, author, recipients, raw);

  await writeEnvUpAtomic(envUpPath, serialize(newFile), privateKey);
}
