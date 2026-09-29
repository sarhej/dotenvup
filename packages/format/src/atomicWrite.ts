/**
 * Atomic .env.up write: secure temp dir → verify decryptable → rename.
 */

import { randomBytes } from 'crypto';
import * as fs from 'fs/promises';
import * as path from 'path';
import { isSafeToDelete } from './safeDelete.js';

/**
 * Write serialized `.env.up` content atomically.
 * Refuses to replace the original if the temp file fails decrypt verification.
 *
 * Uses `mkdtemp` in the target directory (same volume for rename) so the path
 * is not attacker-predictable, then writes with `wx` (O_EXCL).
 */
export async function writeEnvUpAtomic(
  envUpPath: string,
  content: string,
  privateKey: Uint8Array,
): Promise<void> {
  const parent = path.dirname(path.resolve(envUpPath));
  const tmpDir = await fs.mkdtemp(path.join(parent, `.dotenvup-tmp-${randomBytes(4).toString('hex')}-`));
  const tmp = path.join(tmpDir, 'env.up');

  try {
    await fs.writeFile(tmp, content, { encoding: 'utf8', flag: 'wx' });

    const verification = await isSafeToDelete(tmp, privateKey);
    if (!verification.safe) {
      throw new Error(
        `Refusing to replace .env.up: verification failed (${verification.reason}). Original preserved.`,
      );
    }

    await fs.rename(tmp, envUpPath);
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}
