/**
 * Re-encrypt .env.up with current recipients (e.g. after adding a new recipient).
 * Decrypts with local key, then creates a new file with all recipients from config.
 */

import * as fs from 'fs/promises';
import type { ExtensionKeyStore } from '../keystore';

export async function reencryptLocked(
  envUpPath: string,
  root: string,
  keystore: ExtensionKeyStore,
): Promise<void> {
  const { parse, decryptAny, create, serialize, resolveRecipientPublicKeys, isSafeToDelete } =
    await import('@dotenvup/format');
  const { getAuthor } = await import('../author');

  const publicKey = await keystore.getPublicKey();
  const privateKey = await keystore.requirePrivateKey();
  if (!publicKey) throw new Error('No public key');

  const content = await fs.readFile(envUpPath, 'utf8');
  const file = parse(content);
  const { entries, raw } = await decryptAny(file, privateKey, '@local');

  if (Object.keys(entries).length === 0) {
    throw new Error('Decrypted .env.up has zero entries — aborting to avoid data loss');
  }

  const author = await getAuthor(keystore.getIdentityDir());
  const recipients = await resolveRecipientPublicKeys(root, publicKey);
  const newFile = await create(entries, author, recipients, raw);
  const serialized = serialize(newFile);

  const tmpPath = envUpPath + '.tmp-' + Date.now();
  await fs.writeFile(tmpPath, serialized, 'utf8');

  const verification = await isSafeToDelete(tmpPath, privateKey);
  if (!verification.safe) {
    await fs.unlink(tmpPath).catch(() => {});
    throw new Error(`Re-encrypted file failed verification (${verification.reason}). Original .env.up preserved.`);
  }

  await fs.rename(tmpPath, envUpPath);
}
