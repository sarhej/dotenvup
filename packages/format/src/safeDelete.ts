/**
 * @dotenvup/format — Safe deletion guard
 *
 * The single source of truth for whether a .env file can be safely deleted.
 *
 * INVARIANT: .env MUST NEVER be deleted unless a verified, decryptable
 * .env.up exists at the same location with the current key.
 */

import * as fs from 'fs/promises';
import { parse } from './parser.js';
import { decrypt } from './crypto.js';

export interface SafeDeleteResult {
  safe: boolean;
  reason: string;
}

/**
 * Check whether it is safe to delete a .env file.
 *
 * Returns { safe: true } only when ALL conditions are met:
 *   1. .env.up file exists at envUpPath
 *   2. privateKey is available
 *   3. .env.up is parseable
 *   4. .env.up is decryptable with the given key
 *   5. Decrypted result has at least one entry
 */
export async function isSafeToDelete(
  envUpPath: string,
  privateKey: Uint8Array | null,
  preferredRecipient = '@local',
): Promise<SafeDeleteResult> {
  // Check 1: .env.up must exist
  try {
    const stat = await fs.stat(envUpPath);
    if (!stat.isFile()) {
      return { safe: false, reason: '.env.up is not a regular file' };
    }
  } catch {
    return { safe: false, reason: '.env.up does not exist' };
  }

  // Check 2: must have a private key
  if (!privateKey) {
    return { safe: false, reason: 'No private key available' };
  }

  // Check 3: .env.up must be parseable
  let file;
  try {
    const content = await fs.readFile(envUpPath, 'utf8');
    file = parse(content);
  } catch {
    return { safe: false, reason: '.env.up is not parseable' };
  }

  // Check 4: .env.up must be decryptable with current key
  let entries: Record<string, string>;
  try {
    const ordered = file.encryptedBlocks
      .slice()
      .sort((a, b) => (a.recipient === preferredRecipient ? -1 : b.recipient === preferredRecipient ? 1 : 0));
    let dec: { entries: Record<string, string> } | null = null;
    for (const block of ordered) {
      try {
        dec = await decrypt(block, privateKey);
        break;
      } catch {
        // try next
      }
    }
    if (!dec) throw new Error('no decryptable recipient block');
    entries = dec.entries;
  } catch {
    return { safe: false, reason: '.env.up cannot be decrypted with current key' };
  }

  // Check 5: must have at least one entry
  if (Object.keys(entries).length === 0) {
    return { safe: false, reason: '.env.up decrypted to zero entries' };
  }

  return { safe: true, reason: 'ok' };
}
