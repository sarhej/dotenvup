/**
 * Shared write path: merge into existing .env.up or create new (atomic).
 */

import type { ExtensionKeyStore } from './keystore.js';
import { getAuthor } from './author.js';

export async function writeEnvUpFromPlaintext(
  envUpPath: string,
  projectRoot: string,
  plaintext: string,
  entries: Record<string, string>,
  keystore: ExtensionKeyStore,
): Promise<void> {
  const fs = await import('fs/promises');
  const {
    parse,
    serialize,
    create,
    decryptAny,
    mergeReencrypt,
    resolveRecipientPublicKeys,
    PolicyValidationError,
    writeEnvUpAtomic,
  } = await import('@dotenvup/format');

  const privateKey = await keystore.requirePrivateKey();
  const publicKey = await keystore.getPublicKey();
  if (!publicKey) throw new Error('No public key available.');

  const author = await getAuthor(keystore.getIdentityDir());
  const recipientPublicKeys = await resolveRecipientPublicKeys(projectRoot, publicKey);

  let file;
  try {
    const existingContent = await fs.readFile(envUpPath, 'utf8');
    const existing = parse(existingContent);
    const { recipient } = await decryptAny(existing, privateKey, '@local');
    file = await mergeReencrypt({
      existing,
      editorRecipientId: recipient,
      newEntries: entries,
      rawContent: plaintext,
      privateKey,
      recipientPublicKeys,
      author,
    });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      file = await create(entries, author, recipientPublicKeys, plaintext);
    } else if (err instanceof PolicyValidationError) {
      throw err;
    } else {
      throw err;
    }
  }

  await writeEnvUpAtomic(envUpPath, serialize(file), privateKey);
}
