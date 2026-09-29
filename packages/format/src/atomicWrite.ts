/**
 * Atomic .env.up write: exclusive temp file → verify decryptable → rename.
 */

import { randomBytes } from 'crypto';
import * as fs from 'fs/promises';
import { isSafeToDelete } from './safeDelete.js';

/**
 * Write serialized `.env.up` content atomically.
 * Refuses to replace the original if the temp file fails decrypt verification.
 *
 * Temp file lives next to the target (same volume for rename), uses a random
 * suffix, and is created with `wx` (O_EXCL) so we never follow a pre-planted path.
 */
export async function writeEnvUpAtomic(
  envUpPath: string,
  content: string,
  privateKey: Uint8Array,
): Promise<void> {
  const tmp = `${envUpPath}.tmp-${process.pid}-${Date.now()}-${randomBytes(8).toString('hex')}`;
  await fs.writeFile(tmp, content, { encoding: 'utf8', flag: 'wx' });

  try {
    const verification = await isSafeToDelete(tmp, privateKey);
    if (!verification.safe) {
      throw new Error(
        `Refusing to replace .env.up: verification failed (${verification.reason}). Original preserved.`,
      );
    }

    await fs.rename(tmp, envUpPath);
  } catch (err) {
    await fs.unlink(tmp).catch(() => {});
    throw err;
  }
}
