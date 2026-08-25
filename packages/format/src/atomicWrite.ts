/**
 * Atomic .env.up write: temp file → verify decryptable → rename.
 */

import * as fs from 'fs/promises';
import { isSafeToDelete } from './safeDelete.js';

/**
 * Write serialized `.env.up` content atomically.
 * Refuses to replace the original if the temp file fails decrypt verification.
 */
export async function writeEnvUpAtomic(
  envUpPath: string,
  content: string,
  privateKey: Uint8Array,
): Promise<void> {
  const tmp = `${envUpPath}.tmp-${process.pid}-${Date.now()}`;
  await fs.writeFile(tmp, content, 'utf8');

  const verification = await isSafeToDelete(tmp, privateKey);
  if (!verification.safe) {
    await fs.unlink(tmp).catch(() => {});
    throw new Error(
      `Refusing to replace .env.up: verification failed (${verification.reason}). Original preserved.`,
    );
  }

  await fs.rename(tmp, envUpPath);
}
